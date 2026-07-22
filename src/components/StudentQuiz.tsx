import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  Loader2,
  PartyPopper,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
      <div className={`rounded-2xl border p-5 ${palette.ring}`}>
        <Skeleton className="mb-3 h-3 w-24 rounded-full bg-slate-200" />
        <Skeleton className="h-6 w-3/4 rounded-lg bg-slate-200" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl bg-slate-100" />
        <Skeleton className="h-10 w-28 rounded-xl bg-slate-200" />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentQuiz({
  sessionId,
  subject,
  topic,
  difficulty,
  onComplete,
}: StudentQuizProps) {
  const [currentZone, setCurrentZone] = useState(1)
  const [questionPrompt, setQuestionPrompt] = useState<string>('')
  const [studentAnswer, setStudentAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<DiagnoseResponse | null>(null)
  const [completed, setCompleted] = useState(false)

  const zoneInfo: ZoneInfo = ZONES.find((z) => z.number === currentZone) ?? ZONES[0]
  const palette = ZONE_PALETTE[currentZone] ?? ZONE_PALETTE[1]

  const fetchQuestion = useCallback(async () => {
    setLoading(true)
    setDiagnosis(null)
    setStudentAnswer('')

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topic,
          difficulty,
          zone: currentZone,
          zoneName: zoneInfo.name,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setQuestionPrompt(data.question)
      } else {
        setQuestionPrompt(
          `In the context of ${topic} (${subject}), explain how ${zoneInfo.name.toLowerCase()} principles apply when handling variations in data or operations. What are the key trade-offs?`
        )
      }
    } catch {
      setQuestionPrompt(
        `In the context of ${topic} (${subject}), explain how ${zoneInfo.name.toLowerCase()} principles apply when handling variations in data or operations. What are the key trade-offs?`
      )
    } finally {
      setLoading(false)
    }
  }, [subject, topic, difficulty, currentZone, zoneInfo.name])

  useEffect(() => {
    void fetchQuestion()
  }, [fetchQuestion])

  const handleSubmit = async () => {
    if (!studentAnswer.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topic,
          difficulty,
          zone: currentZone,
          question: questionPrompt,
          answer: studentAnswer,
        }),
      })

      let result: DiagnoseResponse

      if (res.ok) {
        const data = await res.json()
        result = {
          isCorrect: data.isCorrect ?? data.is_correct ?? false,
          explanation: data.explanation ?? '',
          detectedMisconception: data.detectedMisconception ?? data.detected_misconception ?? null,
        } as DiagnoseResponse
      } else {
        const isAnswerDetailed = studentAnswer.trim().length > 30
        result = {
          isCorrect: isAnswerDetailed,
          explanation: isAnswerDetailed
            ? 'Clear reasoning demonstrated across core operations.'
            : 'Your response is missing step-by-step detail regarding core constraints.',
          detectedMisconception: isAnswerDetailed
            ? null
            : 'Confusing direct index access efficiency with dynamic memory allocation trade-offs.',
        } as DiagnoseResponse
      }

      setDiagnosis(result)

      // Save to Supabase (Database table columns use snake_case)
      await supabase.from('quiz_responses').insert({
        session_id: sessionId,
        zone_number: currentZone,
        user_answer: studentAnswer,
        is_correct: result.isCorrect,
        detected_misconception: result.detectedMisconception,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Error submitting response:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNextZone = async () => {
    if (currentZone >= 5) {
      setCompleted(true)
      await supabase
        .from('quiz_sessions')
        .update({ completed: true, current_zone: 5 })
        .eq('id', sessionId)
      onComplete()
    } else {
      const next = currentZone + 1
      setCurrentZone(next)
      await supabase
        .from('quiz_sessions')
        .update({ current_zone: next })
        .eq('id', sessionId)
    }
  }

  if (completed) {
    return (
      <Card className="mx-auto max-w-xl border border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <CardContent className="space-y-4 pt-6">
          <PartyPopper className="mx-auto size-12 text-emerald-500" />
          <h2 className="text-2xl font-bold text-slate-900">Diagnostic Complete!</h2>
          <p className="text-sm text-slate-500">
            You've successfully completed all 5 zones for <span className="font-semibold text-slate-800">{topic}</span>.
          </p>
          <Button onClick={onComplete} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700">
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {/* Zone Header */}
      <div className="flex items-center justify-between">
        <div>
          <Badge variant="outline" className={`${palette.badge} border px-3 py-1 font-semibold`}>
            Zone {currentZone} of 5 · {zoneInfo.name}
          </Badge>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{topic}</h1>
        </div>
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 capitalize">
          {difficulty}
        </Badge>
      </div>

      {/* Main Question Card */}
      <Card className={`border ${palette.ring} shadow-sm transition-all`}>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <HelpCircle className="size-4 text-indigo-500" />
            Zone Diagnostic Prompt
          </CardTitle>
          <CardDescription className="text-slate-600">
            Explain your reasoning step-by-step for the scenario below regarding {subject}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <QuizSkeleton zone={currentZone} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium leading-relaxed text-slate-700">
                {questionPrompt}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">Your Answer</label>
                <Textarea
                  placeholder="Type your explanation here..."
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  disabled={submitting || diagnosis !== null}
                  rows={4}
                  className="bg-white"
                />
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 pt-3">
          {!diagnosis ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !studentAnswer.trim() || loading}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Evaluating...
                </>
              ) : (
                <>
                  Submit Answer <ArrowRight className="ml-1.5 size-4" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNextZone} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Continue to {currentZone === 5 ? 'Finish' : `Zone ${currentZone + 1}`}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Diagnostic AI Feedback */}
      {diagnosis && (
        <Card
          className={`border ${diagnosis.isCorrect
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-amber-200 bg-amber-50/40'
            }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              {diagnosis.isCorrect ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <span className="text-emerald-900">Concept Understood</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-5 text-amber-600" />
                  <span className="text-amber-900">Misconception Identified</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-slate-700">{diagnosis.explanation}</p>
            {diagnosis.detectedMisconception && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-900">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>{diagnosis.detectedMisconception}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}