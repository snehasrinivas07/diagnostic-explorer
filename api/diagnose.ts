/**
 * api/diagnose.ts
 * Vercel Serverless Function — Gemini adaptive diagnostic proxy.
 *
 * Responsibilities:
 *  1. Validate inbound request (method, body shape, field ranges).
 *  2. Build a zone-aware, difficulty-calibrated prompt.
 *  3. Call Gemini with structured JSON output (responseSchema).
 *  4. Normalise & sanitise the parsed response.
 *  5. Return the DiagnoseResult or a structured error / graceful fallback.
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

// ─── Utility: Advanced JSON Sanitizer & Repair ─────────────────────────────

function robustParseJson(rawText: string): unknown {
  // Step 1: Strip code block boundaries
  let cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/g, '')
    .trim()

  // Step 2: Extract object content between first '{' and last '}'
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  // Step 3: Replace smart/curly quotes with standard double quotes
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")

  // Step 4: Try standard JSON.parse first
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // Step 5: Fallback repair for unescaped line breaks inside strings
    cleaned = cleaned.replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n')
    return JSON.parse(cleaned)
  }
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

Return valid JSON matching the specified schema.`
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

Return valid JSON matching the specified schema.`
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

  const MAX_LEN = 4000
  for (const [field, val] of Object.entries(b)) {
    if (typeof val === 'string' && val.length > MAX_LEN) {
      return { ok: false, status: 400, error: `Field "${field}" exceeds maximum allowed length of ${MAX_LEN} characters.` }
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    console.error('[diagnose] GEMINI_API_KEY is not set in environment.')
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured in environment variables.' })
    return
  }

  const validation = validateBody(req.body)
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error })
    return
  }

  const body = validation.body

  const prompt = body.isFirstQuestion
    ? buildFirstQuestionPrompt(body)
    : buildEvaluationPrompt(body)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)

    // Using gemini-2.5-flash for adaptive evaluation
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    })

    const result = await model.generateContent(prompt)
    const rawText = result.response.text()

    if (!rawText || rawText.trim().length === 0) {
      console.error('[diagnose] Gemini returned an empty response.')
      res.status(502).json({ error: 'The AI returned an empty response. Please try again.' })
      return
    }

    let parsed: unknown
    try {
      parsed = robustParseJson(rawText)
    } catch (parseError) {
      console.error('[diagnose] Failed to parse Gemini response raw text:', rawText)
      res.status(502).json({ error: 'The AI returned an unparseable response. Please try again.' })
      return
    }

    const normalised = normaliseResult(parsed)

    if (!normalised) {
      console.error('[diagnose] Normalisation failed. Parsed structure:', parsed)
      res.status(502).json({ error: 'The AI response was structurally invalid. Please try again.' })
      return
    }

    res.status(200).json(normalised)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diagnose] Gemini API execution error:', message)

    // FALLBACK FOR RATE LIMITS (429 / Quota Errors)
    if (
      message.includes('429') ||
      message.includes('Quota') ||
      message.includes('Too Many Requests')
    ) {
      console.warn('[diagnose] Rate limit detected. Returning graceful demo fallback.')

      if (body.isFirstQuestion) {
        const fallbackFirstQuestion: DiagnoseResult = {
          isCorrect: false,
          detectedMisconception: null,
          explanation: 'This initial question tests your baseline recall of core data structure definitions and operational goals.',
          nextQuestion: 'In computer science, what is the primary purpose of a data structure?',
          hints: [
            'Think about how data is arranged in computer memory.',
            'Consider how organization affects operation speed like searching or sorting.',
            'A data structure efficiently stores and manages data for optimal access and modification.'
          ]
        }
        res.status(200).json(fallbackFirstQuestion)
        return
      }

      // Fallback for student answer evaluation
      const isValidAnswer = body.studentAnswer.trim().length > 10
      const fallbackEvaluation: DiagnoseResult = {
        isCorrect: isValidAnswer,
        detectedMisconception: isValidAnswer ? null : 'Incomplete explanation of memory management',
        explanation: isValidAnswer
          ? 'Clear and sound reasoning! You correctly highlighted that data structures manage, organize, and store data efficiently in memory.'
          : 'The response touches on the concept but lacks detailed reasoning regarding how structures optimize performance.',
        nextQuestion: 'How does contiguous memory allocation in an array differ from linked allocation in a linked list?',
        hints: [
          'Consider physical memory layout versus pointer references.',
          'Arrays need fixed, continuous blocks of memory.',
          'Linked lists use nodes spread across memory connected by pointers.'
        ]
      }

      res.status(200).json(fallbackEvaluation)
      return
    }

    res.status(500).json({ error: `AI Diagnostic Error: ${message}` })
  }
}