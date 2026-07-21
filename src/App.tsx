import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  BookOpenCheck,
  GraduationCap,
  Loader2,
  LogOut,
  Microscope,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import LearnBrief from '@/components/LearnBrief'
import StudentQuiz from '@/components/StudentQuiz'
import TeacherDash from '@/components/TeacherDash'
import {
  SUBJECTS,
  TOPICS_BY_SUBJECT,
  type DifficultyLevel,
  type Profile,
  type UserRole,
} from '@/types'

type StudentStep = 'setup' | 'brief' | 'quiz'

// ─── Skeleton loader for auth page ───────────────────────────────────────────
function AuthSkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50/40">
      <div className="w-full max-w-md space-y-5 px-6">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-8 animate-pulse rounded-lg bg-slate-200" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  )
}

// ─── Zone progress strip (setup step preview) ────────────────────────────────
function ZonePreviewStrip() {
  const labels = ['Recall', 'Understanding', 'Application', 'Analysis', 'Evaluation']
  return (
    <div className="flex gap-1.5">
      {labels.map((label, i) => (
        <div key={label} className="group flex flex-1 flex-col items-center gap-1">
          <div
            className="h-1 w-full rounded-full bg-gradient-to-r from-indigo-200 to-indigo-100 transition-all duration-200 group-hover:from-indigo-400 group-hover:to-indigo-300"
            style={{ opacity: 0.4 + i * 0.15 }}
          />
          <span className="hidden text-[9px] font-medium tracking-tight text-slate-400 sm:block">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Difficulty chip selector ─────────────────────────────────────────────────
interface DifficultyChipProps {
  value: DifficultyLevel
  selected: boolean
  onClick: () => void
  label: string
  selectedColor: string
}
function DifficultyChip({ value, selected, onClick, label, selectedColor }: DifficultyChipProps) {
  return (
    <button
      type="button"
      data-difficulty={value}
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        selected
          ? `${selectedColor} shadow-sm`
          : `border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700`
      }`}
    >
      {label}
    </button>
  )
}

// ─── Main App component ───────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('student')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // Student flow state
  const [studentStep, setStudentStep] = useState<StudentStep>('setup')
  const [subject, setSubject] = useState<string>(SUBJECTS[0])
  const [topic, setTopic] = useState<string>(TOPICS_BY_SUBJECT[SUBJECTS[0]][0])
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [quizSessionId, setQuizSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)

  // Scroll-to-top when step changes
  const mainRef = useRef<HTMLDivElement>(null)

  const loadProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Failed to load profile:', error.message)
      return null
    }
    return data as Profile
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      if (currentSession?.user) {
        void loadProfile(currentSession.user.id).then(setProfile)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      if (currentSession?.user) {
        void loadProfile(currentSession.user.id).then(setProfile)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Scroll to top whenever the student moves between steps
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [studentStep])

  const handleAuth = async () => {
    setAuthSubmitting(true)
    setAuthError(null)

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role } },
        })
        if (error) throw error
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setStudentStep('setup')
    setQuizSessionId(null)
  }

  const handleSubjectChange = (value: string | null) => {
    if (!value) return
    setSubject(value)
    const topics = TOPICS_BY_SUBJECT[value] ?? []
    setTopic(topics[0] ?? '')
  }

  const handleStartSession = async () => {
    if (!session?.user || !subject || !topic) return

    setCreatingSession(true)
    setSessionError(null)

    const { data, error } = await supabase
      .from('quiz_sessions')
      .insert({
        student_id: session.user.id,
        subject,
        topic,
        difficulty,
        current_zone: 1,
        completed: false,
      })
      .select('id')
      .single()

    setCreatingSession(false)

    if (error) {
      setSessionError(error.message)
      return
    }

    setQuizSessionId(data.id)
    setStudentStep('brief')
  }

  const resetStudentFlow = () => {
    setStudentStep('setup')
    setQuizSessionId(null)
    setSessionError(null)
  }

  // ─── Loading splash ───────────────────────────────────────────────────────
  if (loading) {
    return <AuthSkeleton />
  }

  // ─── Auth screen ──────────────────────────────────────────────────────────
  if (!session || !profile) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-6">
        {/* Background grid decoration */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative w-full max-w-md">
          {/* Brand mark */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-indigo-100 bg-white shadow-md shadow-indigo-100/50">
              <Microscope className="size-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Diagnostic Explorer
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                AI-powered adaptive learning diagnostics
              </p>
            </div>
          </div>

          <Card className="border border-slate-200/60 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur-sm">
            {/* Mode tabs */}
            <div className="flex border-b border-slate-100">
              {(['login', 'signup'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAuthMode(mode)
                    setAuthError(null)
                  }}
                  className={`flex-1 px-4 py-3.5 text-sm font-semibold tracking-wide transition-all duration-200 ${
                    authMode === mode
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {mode === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <CardContent className="space-y-4 pt-6">
              {authMode === 'signup' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Student"
                      className="border-slate-200 bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      I am a
                    </Label>
                    <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                      <SelectTrigger className="border-slate-200 bg-slate-50/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">
                          <span className="flex items-center gap-2">
                            <User className="size-3.5" /> Student
                          </span>
                        </SelectItem>
                        <SelectItem value="teacher">
                          <span className="flex items-center gap-2">
                            <GraduationCap className="size-3.5" /> Teacher
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@college.edu"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth() }}
                  className="border-slate-200 bg-slate-50/50 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth() }}
                  className="border-slate-200 bg-slate-50/50 focus:bg-white"
                />
              </div>

              {authError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-red-500" />
                  {authError}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex-col gap-2 pt-0">
              <Button
                id="auth-submit-btn"
                className="w-full bg-indigo-600 font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.99]"
                onClick={() => void handleAuth()}
                disabled={authSubmitting}
              >
                {authSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : authMode === 'login' ? (
                  'Sign In →'
                ) : (
                  'Create Account →'
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {['5-Zone Adaptive', 'AI Misconception Detect', 'Live Teacher View'].map((feat) => (
              <span
                key={feat}
                className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm"
              >
                {feat}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Authenticated shell ──────────────────────────────────────────────────
  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50/20">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 shadow-sm">
              <Microscope className="size-4.5 text-indigo-600" />
            </div>
            <div className="leading-none">
              <p className="text-sm font-bold tracking-tight text-slate-900">
                Diagnostic Explorer
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {profile.full_name ?? profile.email}
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Breadcrumb for student flow */}
            {profile.role === 'student' && studentStep !== 'setup' && (
              <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
                <button
                  type="button"
                  onClick={resetStudentFlow}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Setup
                </button>
                <span>/</span>
                <span className="capitalize text-slate-700">{studentStep}</span>
              </div>
            )}

            {/* Role badge */}
            <Badge
              variant="outline"
              className={`hidden items-center gap-1.5 text-[11px] sm:flex ${
                profile.role === 'teacher'
                  ? 'border-violet-200 bg-violet-50 text-violet-600'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-600'
              }`}
            >
              {profile.role === 'teacher' ? (
                <GraduationCap className="size-3" />
              ) : (
                <BookOpenCheck className="size-3" />
              )}
              <span className="capitalize">{profile.role}</span>
            </Badge>

            <Button
              id="sign-out-btn"
              variant="outline"
              size="sm"
              onClick={() => void handleSignOut()}
              className="border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>

        {/* Student step progress indicator */}
        {profile.role === 'student' && (
          <div className="flex h-0.5 w-full">
            <div
              className="h-full bg-indigo-600 transition-all duration-500 ease-out"
              style={{
                width:
                  studentStep === 'setup'
                    ? '5%'
                    : studentStep === 'brief'
                      ? '40%'
                      : '100%',
              }}
            />
          </div>
        )}
      </header>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 py-8">
        {profile.role === 'teacher' ? (
          <TeacherDash />
        ) : (
          <>
            {/* ── Setup step ─────────────────────────────────────────────── */}
            {studentStep === 'setup' && (
              <div className="mx-auto w-full max-w-lg px-5">
                <div className="mb-7 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 shadow-sm">
                    <Sparkles className="size-6 text-indigo-600" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Start a Diagnostic
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose your subject, topic, and difficulty level.
                  </p>
                </div>

                <Card className="border border-slate-200/70 bg-white shadow-lg shadow-slate-100/80">
                  <CardHeader className="border-b border-slate-100 pb-4">
                    <ZonePreviewStrip />
                    <CardDescription className="pt-2 text-center text-xs text-slate-400">
                      5 progressive cognitive zones · AI adapts to your answers
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    {/* Subject */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Subject
                      </Label>
                      <Select value={subject} onValueChange={handleSubjectChange}>
                        <SelectTrigger className="border-slate-200 bg-slate-50/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBJECTS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Topic */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Topic
                      </Label>
                      <Select value={topic} onValueChange={(v) => v && setTopic(v)}>
                        <SelectTrigger className="border-slate-200 bg-slate-50/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(TOPICS_BY_SUBJECT[subject] ?? []).map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Difficulty — chip selector */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Difficulty
                      </Label>
                      <div className="flex gap-2">
                        <DifficultyChip
                          value="beginner"
                          selected={difficulty === 'beginner'}
                          onClick={() => setDifficulty('beginner')}
                          label="Beginner"
                          selectedColor="border-emerald-300 bg-emerald-50 text-emerald-700"
                        />
                        <DifficultyChip
                          value="intermediate"
                          selected={difficulty === 'intermediate'}
                          onClick={() => setDifficulty('intermediate')}
                          label="Intermediate"
                          selectedColor="border-amber-300 bg-amber-50 text-amber-700"
                        />
                        <DifficultyChip
                          value="advanced"
                          selected={difficulty === 'advanced'}
                          onClick={() => setDifficulty('advanced')}
                          label="Advanced"
                          selectedColor="border-red-300 bg-red-50 text-red-700"
                        />
                      </div>
                    </div>

                    {sessionError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                        {sessionError}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="border-t border-slate-100 pt-4">
                    <Button
                      id="start-session-btn"
                      className="w-full bg-indigo-600 font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.99]"
                      onClick={() => void handleStartSession()}
                      disabled={creatingSession}
                    >
                      {creatingSession ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Creating session…
                        </>
                      ) : (
                        'Continue to Quick Brief →'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}

            {/* ── Brief step ─────────────────────────────────────────────── */}
            {studentStep === 'brief' && (
              <div className="px-5">
                <LearnBrief
                  subject={subject}
                  topic={topic}
                  difficulty={difficulty}
                  onBeginQuiz={() => setStudentStep('quiz')}
                />
              </div>
            )}

            {/* ── Quiz step ──────────────────────────────────────────────── */}
            {studentStep === 'quiz' && quizSessionId && (
              <div className="px-5">
                <StudentQuiz
                  sessionId={quizSessionId}
                  subject={subject}
                  topic={topic}
                  difficulty={difficulty}
                  onComplete={resetStudentFlow}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 py-4 text-center text-[11px] text-slate-400">
        Diagnostic Explorer · AI-powered adaptive diagnostics
      </footer>
    </div>
  )
}
