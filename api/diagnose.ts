/**
 * api/diagnose.ts
 * Vercel Serverless Function — Gemini 2.5 Flash adaptive diagnostic proxy.
 *
 * Responsibilities:
 *  1. Validate inbound request (method, body shape, field ranges).
 *  2. Build a zone-aware, difficulty-calibrated prompt.
 *  3. Call Gemini 2.5 Flash with structured JSON output (responseSchema).
 *  4. Normalise & sanitise the parsed response.
 *  5. Return the DiagnoseResult or a structured error.
 *
 * Environment variables required:
 *  - GEMINI_API_KEY  (server-side only — never exposed to the browser)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'

// ─── Types ────────────────────────────────────────────────────────────────────

type Difficulty = 'beginner' | 'intermediate' | 'advanced'

interface DiagnoseBody {
  subject: string
  topic: string
  difficulty: Difficulty
  zoneNumber: number
  questionText: string
  studentAnswer: string
  studentReasoning: string
  isFirstQuestion?: boolean
}

interface DiagnoseResult {
  isCorrect: boolean
  detectedMisconception: string | null
  explanation: string
  nextQuestion: string
  hints: string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_DIFFICULTIES: ReadonlySet<string> = new Set([
  'beginner',
  'intermediate',
  'advanced',
])

const ZONE_LABELS: Readonly<Record<number, string>> = {
  1: 'Recall — retrieve basic facts, definitions, and terminology',
  2: 'Understanding — explain concepts in own words, show comprehension',
  3: 'Application — apply knowledge to new scenarios and practical problems',
  4: 'Analysis — break down ideas, compare approaches, find patterns',
  5: 'Evaluation — judge, critique, and synthesize multiple perspectives',
}

const DIFFICULTY_CALIBRATION: Readonly<Record<Difficulty, string>> = {
  beginner:
    'Use straightforward vocabulary. Focus on single-concept questions. Hints should be fairly generous.',
  intermediate:
    'Expect multi-step reasoning and connections between concepts. Moderate question complexity.',
  advanced:
    'Demand nuanced analysis, edge cases, cross-topic synthesis, and evaluative judgment. Hints should be subtle.',
}

// ─── Gemini response schema ───────────────────────────────────────────────────

const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    isCorrect: {
      type: SchemaType.BOOLEAN,
      description:
        'true if the student answer is substantially correct for the zone level and difficulty.',
    },
    detectedMisconception: {
      type: SchemaType.STRING,
      nullable: true,
      description:
        'A short, specific label for a single underlying cognitive misconception (e.g. "confuses stack and queue ordering"). ' +
        'Return null or empty string if the answer was correct or no clear misconception is identifiable.',
    },
    explanation: {
      type: SchemaType.STRING,
      description:
        'Teacher-facing analysis of the answer quality, reasoning gaps, and misconceptions in 2–4 sentences. ' +
        'Be precise and educational. Do not reveal the answer directly.',
    },
    nextQuestion: {
      type: SchemaType.STRING,
      description:
        'The complete text of the next adaptive question. If answering correctly, increase challenge slightly. ' +
        'If struggling, scaffold with a simpler sub-concept before advancing. ' +
        'Must be a full, self-contained question string — no preamble.',
    },
    hints: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        'Exactly 3 progressive hints for the nextQuestion: ' +
        'hint[0] = subtle nudge (direction, not answer), ' +
        'hint[1] = moderate clarification, ' +
        'hint[2] = near-direct guide. Each hint is a single sentence.',
    },
  },
  required: [
    'isCorrect',
    'detectedMisconception',
    'explanation',
    'nextQuestion',
    'hints',
  ],
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildFirstQuestionPrompt(body: DiagnoseBody): string {
  const zoneLabel = ZONE_LABELS[body.zoneNumber] ?? `Zone ${body.zoneNumber}`
  const calibration = DIFFICULTY_CALIBRATION[body.difficulty]

  return `You are an expert adaptive learning diagnostician for a college-level course.

CONTEXT
  Subject   : ${body.subject}
  Topic     : ${body.topic}
  Difficulty: ${body.difficulty}
  Zone      : ${body.zoneNumber} — ${zoneLabel}

DIFFICULTY CALIBRATION
  ${calibration}

TASK
  Generate the FIRST diagnostic question for Zone ${body.zoneNumber}.
  The student has not answered anything yet.

REQUIREMENTS
  • Create one clear, focused question appropriate for ${body.difficulty} level at the "${zoneLabel}" cognitive level.
  • Place the full question text in "nextQuestion".
  • Provide exactly 3 progressive hints: subtle → moderate → near-direct.
  • Set "isCorrect" to false (no answer yet).
  • Set "detectedMisconception" to null.
  • In "explanation", briefly describe what cognitive skill this question is designed to surface.

Return valid JSON exactly matching the schema.`
}

function buildEvaluationPrompt(body: DiagnoseBody): string {
  const zoneLabel = ZONE_LABELS[body.zoneNumber] ?? `Zone ${body.zoneNumber}`
  const calibration = DIFFICULTY_CALIBRATION[body.difficulty]

  return `You are an expert adaptive learning diagnostician for a college-level course.

CONTEXT
  Subject   : ${body.subject}
  Topic     : ${body.topic}
  Difficulty: ${body.difficulty}
  Zone      : ${body.zoneNumber} — ${zoneLabel}

DIFFICULTY CALIBRATION
  ${calibration}

QUESTION ASKED
  "${body.questionText}"

STUDENT ANSWER
  "${body.studentAnswer}"

STUDENT REASONING
  "${body.studentReasoning}"

EVALUATION TASKS
  1. Evaluate correctness at the "${zoneLabel}" cognitive level and ${body.difficulty} difficulty.
     Partial credit counts as incorrect unless the CORE concept is fully sound.
  2. If incorrect or partially wrong, identify ONE specific underlying cognitive misconception
     (e.g. "confuses time complexity with space complexity", "applies formula without understanding units").
     If correct, set detectedMisconception to null.
  3. Write a 2–4 sentence teacher-facing explanation: analyse answer quality, identify reasoning gaps,
     do NOT directly reveal the correct answer.
  4. Generate the NEXT adaptive question for Zone ${body.zoneNumber}:
     - If student mastered this zone: increase challenge slightly within the same zone.
     - If student struggled: scaffold with a simpler sub-concept before full zone mastery.
     The question must be a complete, self-contained sentence.
  5. Provide exactly 3 new progressive hints for that next question.

Return valid JSON exactly matching the schema.`
}

// ─── Input validation ─────────────────────────────────────────────────────────

type ValidationResult = {
  ok: true
  body: DiagnoseBody
} | {
  ok: false
  status: number
  error: string
}

function validateBody(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.' }
  }

  const b = raw as Record<string, unknown>

  // Required fields — type checks
  if (typeof b.subject !== 'string' || !b.subject.trim()) {
    return { ok: false, status: 400, error: '"subject" must be a non-empty string.' }
  }
  if (typeof b.topic !== 'string' || !b.topic.trim()) {
    return { ok: false, status: 400, error: '"topic" must be a non-empty string.' }
  }
  if (typeof b.difficulty !== 'string' || !ALLOWED_DIFFICULTIES.has(b.difficulty)) {
    return { ok: false, status: 400, error: '"difficulty" must be "beginner", "intermediate", or "advanced".' }
  }
  if (typeof b.zoneNumber !== 'number' || !Number.isInteger(b.zoneNumber) || b.zoneNumber < 1 || b.zoneNumber > 5) {
    return { ok: false, status: 400, error: '"zoneNumber" must be an integer 1–5.' }
  }

  const isFirst = b.isFirstQuestion === true

  if (!isFirst) {
    if (typeof b.questionText !== 'string' || !b.questionText.trim()) {
      return { ok: false, status: 400, error: '"questionText" is required when isFirstQuestion is not true.' }
    }
    if (typeof b.studentAnswer !== 'string' || !b.studentAnswer.trim()) {
      return { ok: false, status: 400, error: '"studentAnswer" is required when isFirstQuestion is not true.' }
    }
  }

  // Length guards — prevent prompt injection / runaway costs
  const MAX_LEN = 4000
  for (const [field, val] of Object.entries(b)) {
    if (typeof val === 'string' && val.length > MAX_LEN) {
      return { ok: false, status: 400, error: `Field "${field}" exceeds the maximum allowed length of ${MAX_LEN} characters.` }
    }
  }

  return {
    ok: true,
    body: {
      subject: (b.subject as string).trim().slice(0, 100),
      topic: (b.topic as string).trim().slice(0, 100),
      difficulty: b.difficulty as Difficulty,
      zoneNumber: b.zoneNumber as number,
      questionText: typeof b.questionText === 'string' ? b.questionText.trim() : '',
      studentAnswer: typeof b.studentAnswer === 'string' ? b.studentAnswer.trim() : '',
      studentReasoning: typeof b.studentReasoning === 'string' ? b.studentReasoning.trim() : '',
      isFirstQuestion: isFirst,
    },
  }
}

// ─── Response normalisation ───────────────────────────────────────────────────

function normaliseResult(raw: unknown): DiagnoseResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const nextQuestion =
    typeof r.nextQuestion === 'string' ? r.nextQuestion.trim() : ''
  if (!nextQuestion) return null

  const explanation =
    typeof r.explanation === 'string' ? r.explanation.trim() : ''

  const rawMisconception =
    typeof r.detectedMisconception === 'string'
      ? r.detectedMisconception.trim()
      : null
  const detectedMisconception =
    rawMisconception && rawMisconception.length > 0 ? rawMisconception : null

  const rawHints = Array.isArray(r.hints) ? r.hints : []
  const hints = rawHints
    .slice(0, 3)
    .map((h) => (typeof h === 'string' ? h.trim() : ''))
    .filter((h) => h.length > 0)

  // Pad to 3 if Gemini returned fewer
  while (hints.length < 3) hints.push('')

  return {
    isCorrect: Boolean(r.isCorrect),
    detectedMisconception,
    explanation,
    nextQuestion,
    hints,
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS headers — tighten `Access-Control-Allow-Origin` in production if needed
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // Pre-flight
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const isApiKeySet = !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)
  console.log("GEMINI_API_KEY status:", isApiKeySet)

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  
  const fallbackResponse = {
    isCorrect: false,
    detectedMisconception: null,
    explanation: "Our AI diagnostic service is currently unavailable. This is a fallback response.",
    nextQuestion: "AI Error: Please ensure the GEMINI_API_KEY is configured correctly in your server environment or .env file.",
    hints: ["Check your .env file.", "Verify Vercel environment variables.", "Ensure you have a valid Gemini API key."]
  }

  if (!apiKey) {
    console.error('[diagnose] GEMINI_API_KEY is not set in environment.')
    res.status(200).json(fallbackResponse)
    return
  }

  // Validate body
  const validation = validateBody(req.body)
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error })
    return
  }

  const body = validation.body

  // Build prompt
  const prompt = body.isFirstQuestion
    ? buildFirstQuestionPrompt(body)
    : buildEvaluationPrompt(body)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: body.isFirstQuestion ? 0.8 : 0.65,
        maxOutputTokens: 1024,
      },
    })

    const result = await model.generateContent(prompt)
    const rawText = result.response.text()

    if (!rawText || rawText.trim().length === 0) {
      console.error('[diagnose] Gemini returned an empty response.')
      res.status(502).json({ error: 'The AI returned an empty response. Please try again.' })
      return
    }

    // Parse — Gemini with responseMimeType=application/json should always return valid JSON,
    // but we guard anyway.
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      console.error('[diagnose] Failed to parse Gemini JSON:', rawText.slice(0, 300))
      res.status(502).json({ error: 'The AI returned an unparseable response. Please try again.' })
      return
    }

    const normalised = normaliseResult(parsed)

    if (!normalised) {
      console.error('[diagnose] Normalisation failed. Raw:', JSON.stringify(parsed).slice(0, 300))
      res.status(502).json({ error: 'The AI response was structurally invalid. Please try again.' })
      return
    }

    res.status(200).json(normalised)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diagnose] Gemini API error:', message)
    console.error('Full Gemini Error:', err)

    // Return the structured fallback response instead of a raw 500 error
    const errorFallback = {
      ...fallbackResponse,
      explanation: `AI Generation Error: ${message.slice(0, 100)}...`,
    }
    res.status(200).json(errorFallback)
  }
}
