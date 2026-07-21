import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  Loader2,
  Lock,
  PartyPopper,
  Sparkles,
  Unlock,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import {
  ZONES,
  type DiagnoseResponse,
  type DifficultyLevel,
  type ZoneInfo,
} from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────
interface StudentQuizProps {
  sessionId: string
  subject: string
  topic: string
  difficulty: DifficultyLevel
  onComplete: () => void
}

// ─── Zone colour palette (1–5) ────────────────────────────────────────────────
const ZONE_PALETTE: Record<
  number,
  { ring: string; badge: string; dot: string; glow: string }
> = {
  1: {
    ring: 'border-sky-200 bg-sky-50/60',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
    glow: 'shadow-sky-100/60',
  },
  2: {
    ring: 'border-indigo-200 bg-indigo-50/60',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    dot: 'bg-indigo-500',
    glow: 'shadow-indigo-100/60',
  },
  3: {
    ring: 'border-violet-200 bg-violet-50/60',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
    glow: 'shadow-violet-100/60',
  },
  4: {
    ring: 'border-purple-200 bg-purple-50/60',
    badge: 'border-purple-200 bg-purple-50 text-purple-700',
    dot: 'bg-purple-500',
    glow: 'shadow-purple-100/60',
  },
  5: {
    ring: 'border-fuchsia-200 bg-fuchsia-50/60',
    badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    dot: 'bg-fuchsia-500',
    glow: 'shadow-fuchsia-100/60',
  },
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function QuizSkeleton({ zone }: { zone: number }) {
  const palette = ZONE_PALETTE[zone] ?? ZONE_PALETTE[1]
  return (
    <div className="space-y-6">
      {/* Question box skeleton */}
      <div className={`rounded-2xl border p-5 ${palette.ring}`}>
        <Skeleton className="mb-3 h-3 w-24 rounded-full bg-slate-200" />
        <Skeleton className="mb-2 h-5 w-full rounded-lg bg-slate-200" />
        <Skeleton className="mb-2 h-5 w-4/5 rounded-lg bg-slate-200" />
        <Skeleton className="h-5 w-3/5 rounded-lg bg-slate-200" />
      </div>
      {/* Hint skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-full bg-slate-200" />
        <Skeleton className="h-9 w-32 rounded-lg bg-slate-200" />
      </div>
      {/* Answer skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 rounded-full bg-slate-200" />
        <Skeleton className="h-10 w-full rounded-lg bg-slate-200" />
      </div>
      {/* Reasoning skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32 rounded-full bg-slate-200" />
        <Skeleton className="h-28 w-full rounded-lg bg-slate-200" />
      </div>
      <Skeleton className="ml-auto h-10 w-36 rounded-lg bg-slate-200" />
    </div>
  )
}

// ─── Zone stepper ─────────────────────────────────────────────────────────────
function ZoneStepper({
  currentZone,
  zones,
}: {
  currentZone: number
  zones: ZoneInfo[]
}) {
  return (
    <div className="flex items-center gap-0">
      {zones.map((zone, idx) => {
        const isCompleted = zone.number < currentZone
        const isActive = zone.number === currentZone
        const palette = ZONE_PALETTE[zone.number] ?? ZONE_PALETTE[1]

        return (
          <div key={zone.number} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? 'border-emerald-400 bg-emerald-500 text-white shadow-sm'
                    : isActive
                      ? `border-2 ${palette.badge.split(' ').find((c) => c.startsWith('border-')) ?? 'border-indigo-400'} bg-white text-slate-900 shadow-md ring-2 ring-indigo-200/50`
                      : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-4 text-white" />
                ) : (
                  zone.number
                )}
              </div>
              <span
                className={`hidden text-[10px] font-semibold tracking-wide transition-all duration-300 sm:block ${
                  isActive
                    ? 'text-slate-800'
                    : isCompleted
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                }`}
              >
                {zone.name}
              </span>
            </div>

            {/* Connector line */}
            {idx < zones.length - 1 && (
              <div
                className={`mx-1 mb-4 h-0.5 flex-1 transition-all duration-500 sm:mx-2 ${
                  zone.number < currentZone ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
                style={{ minWidth: '1.5rem' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Hint panel ───────────────────────────────────────────────────────────────
function HintPanel({
  hints,
  revealed,
  onReveal,
  disabled,
}: {
  hints: string[]
  revealed: number
  onReveal: () => void
  disabled: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (revealed > 0) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [revealed])

  return (
    <div ref={panelRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <HelpCircle className="size-3.5 text-indigo-500" />
          Hints
        </Label>
        <span className="text-[11px] text-slate-400">
          {revealed} / {hints.length} revealed
        </span>
      </div>

      {/* Revealed hints */}
      <div className="space-y-2">
        {hints.slice(0, revealed).map((hint, i) => (
          <div
            key={i}
            className="flex gap-2.5 rounded-xl border border-indigo-100/80 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-900 transition-all duration-300 ease-in-out"
            style={{
              animation: 'fadeSlideIn 0.3s ease-out both',
            }}
          >
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-indigo-400" />
            <span>
              <span className="font-semibold text-indigo-700">Hint {i + 1}:</span>{' '}
              {hint}
            </span>
          </div>
        ))}
      </div>

      {/* Locked hints preview */}
      {hints.slice(revealed).map((_, i) => (
        <div
          key={`locked-${i}`}
          className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-400"
        >
          <Lock className="size-3.5 shrink-0 text-slate-300" />
          <span className="text-xs">Hint {revealed + i + 1} — locked</span>
        </div>
      ))}

      {/* Reveal button */}
      {revealed < hints.length && (
        <Button
          id="reveal-hint-btn"
          variant="outline"
          size="sm"
          onClick={onReveal}
          disabled={disabled}
          className="mt-1 border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
        >
          <Unlock className="size-3.5" />
          Reveal Hint {revealed + 1}
        </Button>
      )}

      {revealed >= hints.length && hints.length > 0 && (
        <p className="text-xs text-slate-400">All hints revealed.</p>
      )}
    </div>
  )
}

// ─── Feedback panel ───────────────────────────────────────────────────────────
function FeedbackPanel({ feedback, zone }: { feedback: DiagnoseResponse; zone: number }) {
  const isCorrect = feedback.isCorrect
  const palette = ZONE_PALETTE[zone] ?? ZONE_PALETTE[1]

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-300 ease-in-out ${
        isCorrect
          ? 'border-emerald-200/80 bg-emerald-50/60'
          : 'border-amber-200/80 bg-amber-50/60'
      }`}
      style={{ animation: 'fadeSlideIn 0.35s ease-out both' }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {isCorrect ? (
          <>
            <CheckCircle2 className="size-5 text-emerald-600" />
            <span className="font-semibold text-emerald-700">Correct</span>
          </>
        ) : (
          <>
            <XCircle className="size-5 text-amber-600" />
            <span className="font-semibold text-amber-700">Needs improvement</span>
          </>
        )}
        {/* Zone context chip */}
        <Badge variant="outline" className={`ml-auto text-[10px] ${palette.badge}`}>
          Zone {zone}
        </Badge>
      </div>

      {/* Misconception pill */}
      {feedback.detectedMisconception && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200/80 bg-white/60 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">Detected misconception: </span>
            {feedback.detectedMisconception}
          </span>
        </div>
      )}

      {/* Explanation */}
      <p className="text-sm leading-relaxed text-slate-700">{feedback.explanation}</p>

      {/* Next question preview if staying in zone */}
      {!isCorrect && feedback.nextQuestion && (
        <div className="mt-3 rounded-lg border border-slate-200/60 bg-white/50 px-3 py-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Next question preview: </span>
          <span className="italic">{feedback.nextQuestion.slice(0, 100)}…</span>
        </div>
      )}
    </div>
  )
}

// ─── Completion screen ────────────────────────────────────────────────────────
function CompletionScreen({ topic, onComplete }: { topic: string; onComplete: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5">
      <Card className="border border-emerald-200/60 bg-white shadow-xl shadow-emerald-100/40">
        <CardHeader className="items-center pb-4 pt-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 shadow-md shadow-emerald-100">
            <PartyPopper className="size-8 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl tracking-tight text-slate-900">
            Diagnostic Complete!
          </CardTitle>
          <CardDescription className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            You finished all <strong>5 zones</strong> for{' '}
            <strong className="text-slate-700">{topic}</strong>. Your responses have been
            saved and your teacher can review them live in the dashboard.
          </CardDescription>
        </CardHeader>

        {/* Zone completion summary */}
        <CardContent className="px-8 pb-2">
          <div className="flex justify-center gap-2">
            {ZONES.map((z) => (
              <div
                key={z.number}
                className="flex flex-col items-center gap-1"
              >
                <div className="flex size-9 items-center justify-center rounded-full border border-emerald-300 bg-emerald-500 shadow-sm">
                  <CheckCircle2 className="size-4 text-white" />
                </div>
                <span className="hidden text-[10px] font-medium text-emerald-600 sm:block">
                  {z.name}
                </span>
              </div>
            ))}
          </div>
        </CardContent>

        <CardFooter className="flex justify-center pb-8 pt-4">
          <Button
            id="new-session-btn"
            className="bg-indigo-600 px-8 font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.99]"
            onClick={onComplete}
          >
            Start New Session
            <ArrowRight className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

// ─── Main StudentQuiz component ────────────────────────────────────────────────
export default function StudentQuiz({
  sessionId,
  subject,
  topic,
  difficulty,
  onComplete,
}: StudentQuizProps) {
  const [currentZone, setCurrentZone] = useState(1)
  const [questionText, setQuestionText] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [revealedHints, setRevealedHints] = useState(0)
  const [answer, setAnswer] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<DiagnoseResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [transitioningZone, setTransitioningZone] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)

  const fetchQuestionForZone = useCallback(
    async (zone: number) => {
      setLoading(true)
      setError(null)
      setFeedback(null)
      setAnswer('')
      setReasoning('')
      setRevealedHints(0)

      try {
        const response = await fetch('/api/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            topic,
            difficulty,
            zoneNumber: zone,
            questionText: '',
            studentAnswer: '',
            studentReasoning: '',
            isFirstQuestion: true,
          }),
        })

        const text = await response.text()
        let data
        try {
          data = JSON.parse(text)
        } catch (err) {
          throw new Error('API Error: Received HTML instead of JSON. Ensure you are running the backend (e.g. vercel dev / npm run dev:full).')
        }

        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to load question')
        }

        const diagData = data as DiagnoseResponse
        setQuestionText(diagData.nextQuestion)
        setHints(diagData.hints)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    },
    [subject, topic, difficulty],
  )

  useEffect(() => {
    void fetchQuestionForZone(1)
  }, [fetchQuestionForZone])

  const handleSubmit = async () => {
    if (!answer.trim()) {
      setError('Please provide an answer before submitting.')
      return
    }
    if (!reasoning.trim()) {
      setError('Please explain your reasoning — the AI uses it to detect misconceptions.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topic,
          difficulty,
          zoneNumber: currentZone,
          questionText,
          studentAnswer: answer,
          studentReasoning: reasoning,
        }),
      })

      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch (err) {
        throw new Error('API Error: Received HTML instead of JSON. Ensure you are running the backend (e.g. vercel dev / npm run dev:full).')
      }

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to analyze answer')
      }

      const diagData = data as DiagnoseResponse
      setFeedback(diagData)

      // Save response to Supabase
      const hintsUsed = hints.slice(0, revealedHints)
      const { error: insertError } = await supabase.from('responses').insert({
        session_id: sessionId,
        zone_number: currentZone,
        question_text: questionText,
        student_answer: answer,
        student_reasoning: reasoning,
        is_correct: diagData.isCorrect,
        detected_misconception: diagData.detectedMisconception,
        ai_explanation: diagData.explanation,
        hints_used: hintsUsed,
      })

      if (insertError) throw new Error(insertError.message)

      // Handle zone completion
      if (currentZone >= 5) {
        await supabase
          .from('quiz_sessions')
          .update({
            current_zone: 5,
            completed: true,
            completed_at: new Date().toISOString(),
          })
          .eq('id', sessionId)

        setCompleted(true)
        return
      }

      // Advance to next zone after a brief feedback moment
      const nextZone = currentZone + 1

      await supabase
        .from('quiz_sessions')
        .update({ current_zone: nextZone })
        .eq('id', sessionId)

      // Animate zone transition
      setTimeout(() => {
        setTransitioningZone(true)
        setTimeout(async () => {
          setCurrentZone(nextZone)
          setTransitioningZone(false)
          await fetchQuestionForZone(nextZone)
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 350)
      }, 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const zoneInfo = ZONES.find((z) => z.number === currentZone)
  const palette = ZONE_PALETTE[currentZone] ?? ZONE_PALETTE[1]

  if (completed) {
    return <CompletionScreen topic={topic} onComplete={onComplete} />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{topic}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {subject} ·{' '}
            <span className="capitalize text-slate-600">{difficulty}</span>
          </p>
        </div>
        <Badge variant="outline" className={`text-xs ${palette.badge}`}>
          <span
            className={`mr-1.5 inline-block size-1.5 rounded-full ${palette.dot} animate-pulse`}
          />
          Zone {currentZone} · {zoneInfo?.name}
        </Badge>
      </div>

      {/* ── Zone stepper ──────────────────────────────────────────────────── */}
      <ZoneStepper currentZone={currentZone} zones={ZONES} />

      {/* ── Main quiz card ────────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        className={`transition-all duration-350 ease-in-out ${
          transitioningZone ? 'scale-[0.98] opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <Card
          className={`overflow-hidden border bg-white shadow-xl transition-all duration-300 ${palette.glow}`}
          style={{
            borderColor: '',
          }}
        >
          {/* Card header */}
          <CardHeader className={`border-b ${palette.ring}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
                  <Sparkles className="size-4 text-indigo-500" />
                  Zone {currentZone}: {zoneInfo?.name}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {zoneInfo?.description}
                  <span className="ml-2 font-medium text-slate-500">
                    · Bloom's: {zoneInfo?.cognitiveLevel}
                  </span>
                </CardDescription>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-slate-300" />
            </div>
          </CardHeader>

          <CardContent className="space-y-7 pt-7">
            {loading ? (
              <QuizSkeleton zone={currentZone} />
            ) : (
              <>
                {/* ── Question display ─────────────────────────────────── */}
                <div
                  className={`rounded-2xl border p-5 ${palette.ring}`}
                  style={{ animation: 'fadeSlideIn 0.3s ease-out both' }}
                >
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Question
                  </p>
                  <p className="text-[15px] leading-relaxed text-slate-900">
                    {questionText}
                  </p>
                </div>

                {/* ── Progressive hints ────────────────────────────────── */}
                <HintPanel
                  hints={hints}
                  revealed={revealedHints}
                  onReveal={() => setRevealedHints((prev) => Math.min(prev + 1, hints.length))}
                  disabled={submitting}
                />

                {/* ── Answer input ─────────────────────────────────────── */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="student-answer"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Your Answer
                  </Label>
                  <Input
                    id="student-answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer here…"
                    className="border-slate-200 bg-slate-50/50 text-sm focus:bg-white"
                    disabled={submitting || !!feedback}
                  />
                </div>

                {/* ── Reasoning textarea ───────────────────────────────── */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="student-reasoning"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Your Reasoning
                    <span className="ml-1.5 font-normal normal-case text-slate-400">
                      (required — the AI reads this)
                    </span>
                  </Label>
                  <Textarea
                    id="student-reasoning"
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    placeholder="Explain how you arrived at this answer…"
                    rows={4}
                    className="resize-none border-slate-200 bg-slate-50/50 text-sm focus:bg-white"
                    disabled={submitting || !!feedback}
                  />
                </div>

                {/* ── AI feedback panel ─────────────────────────────────── */}
                {feedback && (
                  <FeedbackPanel feedback={feedback} zone={currentZone} />
                )}

                {/* ── Error message ─────────────────────────────────────── */}
                {error && (
                  <div
                    className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    style={{ animation: 'fadeSlideIn 0.25s ease-out both' }}
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
                    {error}
                  </div>
                )}

                {/* ── Zone transition indicator ─────────────────────────── */}
                {feedback && !transitioningZone && currentZone < 5 && (
                  <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-xs text-indigo-700">
                    <Loader2 className="size-3.5 animate-spin text-indigo-400" />
                    Loading Zone {currentZone + 1}…
                  </div>
                )}
              </>
            )}
          </CardContent>

          {/* ── Submit footer ─────────────────────────────────────────────── */}
          {!loading && !feedback && (
            <CardFooter className="justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
              <p className="text-xs text-slate-400">
                {revealedHints > 0 ? `${revealedHints} hint${revealedHints > 1 ? 's' : ''} used` : 'No hints used yet'}
              </p>
              <Button
                id="submit-answer-btn"
                onClick={() => void handleSubmit()}
                disabled={submitting || !answer.trim() || !reasoning.trim()}
                className="bg-indigo-600 font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    Submit & Continue
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* ── Inline CSS keyframe animation ─────────────────────────────────── */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
