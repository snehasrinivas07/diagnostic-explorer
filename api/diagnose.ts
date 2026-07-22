/**
 * api/diagnose.ts
 * Vercel Serverless Function — Gemini 3.6 Flash adaptive diagnostic proxy.
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
      description: 'true if the student answer is substantially correct for the zone level and difficulty.',
    },
    detectedMisconception: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'A short label for the cognitive misconception, or null if correct/none.',
    },
    explanation: {
      type: SchemaType.STRING,
      description: 'Teacher-facing analysis of answer quality (2-4 sentences). Do not give answer.',
    },
    nextQuestion: {
      type: SchemaType.STRING,
      description: 'Full text of the next adaptive question.',
    },
    hints: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Exactly 3 progressive hints for the nextQuestion.',
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

  // Step 4: First pass attempt standard parse
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    // Step 5: Fix unescaped newlines inside JSON string properties
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
  • Set "isCorrect" to false.
  • Set "detectedMisconception" to null.
  • In "explanation", briefly describe what cognitive skill this question is designed to surface.`
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
  2. Identify ONE specific underlying cognitive misconception if incorrect, else set detectedMisconception to null.
  3. Write a 2–4 sentence teacher-facing explanation.
  4. Generate the NEXT adaptive question for Zone ${body.zoneNumber}.
  5. Provide exactly 3 new progressive hints for that next question.`
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
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' })
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

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: body.isFirstQuestion ? 0.7 : 0.4,
      },
    })

    const result = await model.generateContent(prompt)
    const rawText = result.response.text()

    if (!rawText || rawText.trim().length === 0) {
      res.status(502).json({ error: 'The AI returned an empty response. Please try again.' })
      return
    }

    let parsed: unknown
    try {
      parsed = robustParseJson(rawText)
    } catch (parseErr) {
      console.error('[diagnose] Parse error. Raw output was:', rawText)
      res.status(502).json({ error: 'The AI returned an unparseable response. Please try again.' })
      return
    }

    const normalised = normaliseResult(parsed)

    if (!normalised) {
      console.error('[diagnose] Normalisation failed. Parsed:', parsed)
      res.status(502).json({ error: 'The AI response was structurally invalid. Please try again.' })
      return
    }

    res.status(200).json(normalised)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diagnose] Gemini API error:', message)
    res.status(500).json({ error: `AI Diagnostic Error: ${message}` })
  }
}