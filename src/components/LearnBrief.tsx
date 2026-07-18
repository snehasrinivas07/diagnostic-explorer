import { useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
  Lightbulb,
  Target,
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ZONES, type DifficultyLevel } from '@/types'

interface LearnBriefProps {
  subject: string
  topic: string
  difficulty: DifficultyLevel
  onBeginQuiz: () => void
}

const DIFFICULTY_NOTES: Record<DifficultyLevel, string> = {
  beginner:
    'Focus on foundational vocabulary, core definitions, and straightforward applications.',
  intermediate:
    'Expect multi-step reasoning, connections between concepts, and moderate complexity scenarios.',
  advanced:
    'Prepare for nuanced analysis, edge cases, synthesis across subtopics, and evaluative judgment.',
}

export default function LearnBrief({
  subject,
  topic,
  difficulty,
  onBeginQuiz,
}: LearnBriefProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2 text-center">
        <Badge
          variant="outline"
          className="border-indigo-200 bg-indigo-50 text-indigo-600"
        >
          Quick Brief
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {topic}
        </h1>
        <p className="text-sm text-slate-500">
          {subject} ·{' '}
          <span className="capitalize text-indigo-600">{difficulty}</span>
        </p>
      </div>

      <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-sm transition-all duration-300 ease-in-out">
        <CardHeader className="border-b border-slate-200/80 bg-slate-50/50">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 text-left">
              <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
                <BookOpen className="size-5 text-indigo-600" />
                Study Guide Overview
              </CardTitle>
              <CardDescription>
                Review this brief before starting your 5-zone adaptive diagnostic.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((prev) => !prev)}
              className="shrink-0 border-slate-200/80"
            >
              {expanded ? (
                <>
                  Collapse
                  <ChevronUp className="size-4" />
                </>
              ) : (
                <>
                  Expand
                  <ChevronDown className="size-4" />
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-6 text-left">
          <div className="flex items-start gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-4">
            <Target className="mt-0.5 size-5 shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium tracking-tight text-slate-900">
                Session Focus
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                You will work through <strong>{topic}</strong> in{' '}
                <strong>{subject}</strong> across five progressive cognitive
                zones. The AI adapts each question based on your answer and
                reasoning.
              </p>
            </div>
          </div>

          <div
            className="grid transition-all duration-300 ease-in-out"
            style={{
              gridTemplateRows: expanded ? '1fr' : '0fr',
            }}
          >
            <div className="overflow-hidden">
              <div className="space-y-4 pb-2">
                <Separator className="bg-slate-200/80" />

                <div className="flex items-start gap-3">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="font-medium tracking-tight text-slate-900">
                      Difficulty Expectations
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {DIFFICULTY_NOTES[difficulty]}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Layers className="mt-0.5 size-5 shrink-0 text-indigo-600" />
                  <div className="w-full">
                    <p className="font-medium tracking-tight text-slate-900">
                      The 5 Progressive Zones
                    </p>
                    <ul className="mt-3 space-y-2">
                      {ZONES.map((zone) => (
                        <li
                          key={zone.number}
                          className="flex gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-sm transition-all duration-300 ease-in-out"
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">
                            {zone.number}
                          </span>
                          <div>
                            <p className="font-medium text-slate-900">
                              {zone.name}{' '}
                              <span className="font-normal text-slate-400">
                                · {zone.cognitiveLevel}
                              </span>
                            </p>
                            <p className="text-slate-500">{zone.description}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 text-sm text-amber-900">
                  <strong>Tip:</strong> Always explain your reasoning in the
                  text area. The diagnostic engine uses both your answer and
                  your thought process to detect misconceptions.
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end border-t border-slate-200/80 bg-white">
          <Button
            onClick={onBeginQuiz}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Begin Zone 1 Quiz
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
