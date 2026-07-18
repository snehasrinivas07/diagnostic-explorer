import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock,
  Radio,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import {
  ZONES,
  type MisconceptionGroup,
  type QuizResponse,
  type SessionWithProfile,
} from '@/types'

// ─── Live pulse indicator ─────────────────────────────────────────────────────
function LivePulse({ active }: { active: boolean }) {
  if (!active) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="text-[10px] font-medium text-slate-400">Idle</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[10px] font-semibold tracking-wide text-emerald-600">
        Live
      </span>
    </div>
  )
}

// ─── Zone progress ring for student cards ─────────────────────────────────────
function ZoneRing({
  currentZone,
  completed,
}: {
  currentZone: number
  completed: boolean
}) {
  const totalZones = 5
  const progress = completed ? 1 : (currentZone - 1) / totalZones
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  const color = completed
    ? '#10b981'
    : currentZone >= 4
      ? '#8b5cf6'
      : currentZone >= 3
        ? '#6366f1'
        : '#3b82f6'

  return (
    <div className="relative size-12 shrink-0">
      <svg
        className="-rotate-90"
        width="48"
        height="48"
        viewBox="0 0 48 48"
      >
        {/* Track */}
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3"
        />
        {/* Progress arc */}
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-in-out' }}
        />
      </svg>
      {/* Zone number */}
      <div className="absolute inset-0 flex items-center justify-center">
        {completed ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : (
          <span
            className="text-xs font-bold"
            style={{ color }}
          >
            {currentZone}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Severity bar (heatmap rows) ──────────────────────────────────────────────
function SeverityBar({
  severity,
  count,
  maxCount,
}: {
  severity: MisconceptionGroup['severity']
  count: number
  maxCount: number
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  const colors = {
    high: 'bg-red-500',
    medium: 'bg-amber-400',
    low: 'bg-amber-300',
  }
  const trackColors = {
    high: 'bg-red-100',
    medium: 'bg-amber-100',
    low: 'bg-amber-50',
  }

  return (
    <div className={`h-2 w-full rounded-full ${trackColors[severity]}`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${colors[severity]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function DashSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-5 py-6">
      {/* Stat cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <Skeleton className="mb-2 h-3 w-28 rounded-full bg-slate-200" />
            <Skeleton className="h-9 w-16 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>
      {/* Student grid skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 rounded-lg bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded-full bg-slate-200" />
                  <Skeleton className="h-3 w-24 rounded-full bg-slate-200" />
                </div>
              </div>
              <Skeleton className="h-2 w-full rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function buildMisconceptionGroups(responses: QuizResponse[]): MisconceptionGroup[] {
  const map = new Map<string, { count: number; zones: Set<number> }>()

  for (const response of responses) {
    if (!response.detected_misconception) continue
    const key = response.detected_misconception.trim()
    const existing = map.get(key) ?? { count: 0, zones: new Set<number>() }
    existing.count += 1
    existing.zones.add(response.zone_number)
    map.set(key, existing)
  }

  return Array.from(map.entries())
    .map(([misconception, data]) => {
      const severity: MisconceptionGroup['severity'] =
        data.count >= 5 ? 'high' : data.count >= 3 ? 'medium' : 'low'
      return {
        misconception,
        count: data.count,
        zones: Array.from(data.zones).sort((a, b) => a - b),
        severity,
      }
    })
    .sort((a, b) => b.count - a.count)
}

function formatElapsed(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// ─── Main TeacherDash component ───────────────────────────────────────────────
export default function TeacherDash() {
  const [sessions, setSessions] = useState<SessionWithProfile[]>([])
  const [responses, setResponses] = useState<QuizResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [, setTick] = useState(0)

  // Re-render every 30s to update relative timestamps
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    const [sessionsResult, responsesResult] = await Promise.all([
      supabase
        .from('quiz_sessions')
        .select('*, profiles(full_name, email)')
        .order('started_at', { ascending: false }),
      supabase
        .from('responses')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    if (sessionsResult.data) setSessions(sessionsResult.data as SessionWithProfile[])
    if (responsesResult.data) setResponses(responsesResult.data as QuizResponse[])
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  useEffect(() => {
    void loadData()

    const channel = supabase
      .channel('teacher-dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'responses' },
        (payload) => {
          const newResponse = payload.new as QuizResponse
          setResponses((prev) => [newResponse, ...prev])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_sessions' },
        (payload) => {
          const updated = payload.new as SessionWithProfile
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quiz_sessions' },
        () => { void loadData() },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => { void supabase.removeChannel(channel) }
  }, [loadData])

  // ─── Derived data ──────────────────────────────────────────────────────────
  const activeSessions = useMemo(
    () => sessions.filter((s) => !s.completed),
    [sessions],
  )

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.completed),
    [sessions],
  )

  const misconceptionGroups = useMemo(
    () => buildMisconceptionGroups(responses),
    [responses],
  )

  const maxMisconceptionCount = useMemo(
    () => Math.max(1, ...misconceptionGroups.map((g) => g.count)),
    [misconceptionGroups],
  )

  const responsesBySession = useMemo(() => {
    const map = new Map<string, QuizResponse[]>()
    for (const response of responses) {
      const list = map.get(response.session_id) ?? []
      list.push(response)
      map.set(response.session_id, list)
    }
    return map
  }, [responses])

  const correctRate = useMemo(() => {
    if (responses.length === 0) return null
    const correct = responses.filter((r) => r.is_correct).length
    return Math.round((correct / responses.length) * 100)
  }, [responses])

  if (loading) return <DashSkeleton />

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-5">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Teacher Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live diagnostic overview · all student sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Refresh button */}
          <Button
            id="teacher-refresh-btn"
            variant="outline"
            size="sm"
            onClick={() => void handleManualRefresh()}
            disabled={refreshing}
            className="border-slate-200/80 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Connection status */}
          <Badge
            variant="outline"
            className={`gap-2 border ${
              connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <Radio className="size-3" />
            {connected ? 'Realtime Connected' : 'Connecting…'}
          </Badge>
        </div>
      </div>

      {/* Last refresh timestamp */}
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Clock className="size-3" />
        Last updated {formatElapsed(lastRefresh.toISOString())}
      </p>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active students */}
        <Card className="border border-slate-200/60 bg-white shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs text-slate-500">
              <Users className="size-3.5 text-indigo-400" />
              Active Students
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight text-indigo-600">
              {activeSessions.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LivePulse active={activeSessions.length > 0} />
          </CardContent>
        </Card>

        {/* Total responses */}
        <Card className="border border-slate-200/60 bg-white shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs text-slate-500">
              <Activity className="size-3.5 text-violet-400" />
              Total Responses
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">
              {responses.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-slate-400">
              {completedSessions.length} session{completedSessions.length !== 1 ? 's' : ''} completed
            </p>
          </CardContent>
        </Card>

        {/* Correct rate */}
        <Card className="border border-slate-200/60 bg-white shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs text-slate-500">
              <Zap className="size-3.5 text-emerald-400" />
              Correct Rate
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight text-emerald-600">
              {correctRate !== null ? `${correctRate}%` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {correctRate !== null && (
              <div className="h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${correctRate}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Misconception patterns */}
        <Card className="border border-slate-200/60 bg-white shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs text-slate-500">
              <AlertTriangle className="size-3.5 text-amber-400" />
              Misconception Patterns
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight text-amber-500">
              {misconceptionGroups.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-slate-400">
              {misconceptionGroups.filter((g) => g.severity === 'high').length} high severity
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Student status grid ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Users className="size-4.5 text-indigo-500" />
            Student Status
          </h2>
          <span className="text-xs text-slate-400">
            {sessions.length} total session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {sessions.length === 0 ? (
          <Card className="border border-dashed border-slate-200 bg-white">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Users className="mb-3 size-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No sessions yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Students will appear here when they start a diagnostic.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => {
              const sessionResponses = responsesBySession.get(session.id) ?? []
              const latestResponse = sessionResponses[0]
              const isActive = !session.completed
              const hasMisconception = latestResponse?.detected_misconception

              return (
                <Card
                  key={session.id}
                  className={`relative overflow-hidden border bg-white shadow-sm transition-all duration-300 hover:shadow-md ${
                    isActive
                      ? 'border-slate-200/80'
                      : 'border-slate-100 opacity-80'
                  }`}
                >
                  {/* Active highlight strip */}
                  {isActive && (
                    <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-400 to-indigo-600" />
                  )}

                  <CardHeader className="pb-3 pl-5">
                    <div className="flex items-start gap-3">
                      {/* Zone ring */}
                      <ZoneRing
                        currentZone={session.current_zone}
                        completed={session.completed}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="truncate text-sm font-semibold tracking-tight text-slate-900">
                            {session.profiles?.full_name ??
                              session.profiles?.email ??
                              'Student'}
                          </CardTitle>
                          <LivePulse active={isActive} />
                        </div>
                        <CardDescription className="mt-0.5 truncate text-xs">
                          {session.topic} · {session.subject}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pl-5">
                    {/* Zone progress bar */}
                    <div>
                      <div className="mb-1.5 flex justify-between text-[10px] text-slate-400">
                        <span>Progress</span>
                        <span>
                          Zone {session.current_zone} / 5
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {ZONES.map((z) => (
                          <div
                            key={z.number}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                              session.completed || z.number < session.current_zone
                                ? 'bg-emerald-500'
                                : z.number === session.current_zone && !session.completed
                                  ? 'bg-indigo-500'
                                  : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Badges row */}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className="border-slate-200/80 text-[10px] capitalize text-slate-500"
                      >
                        {session.difficulty}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          session.completed
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-600'
                        }`}
                      >
                        {session.completed ? 'Completed' : `Zone ${session.current_zone} · ${ZONES.find((z) => z.number === session.current_zone)?.name ?? ''}`}
                      </Badge>
                    </div>

                    {/* Stats */}
                    <p className="text-[11px] text-slate-400">
                      {sessionResponses.length} response{sessionResponses.length !== 1 ? 's' : ''} ·{' '}
                      Started {formatElapsed(session.started_at)}
                    </p>

                    {/* Latest misconception alert */}
                    {hasMisconception && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                        <span className="line-clamp-2">{latestResponse.detected_misconception}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Misconception Heatmap ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Brain className="size-4.5 text-indigo-500" />
            Misconception Heatmap
          </h2>
          {misconceptionGroups.length > 0 && (
            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" /> High (5+)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-400" /> Medium (3–4)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-300" /> Low (1–2)
              </span>
            </div>
          )}
        </div>

        {misconceptionGroups.length === 0 ? (
          <Card className="border border-dashed border-slate-200 bg-white">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <BarChart3 className="mb-3 size-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No misconceptions detected yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Patterns will aggregate here as students submit answers.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <span>Misconception</span>
              <span className="text-center">Zones</span>
              <span className="text-center">Students</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100/80">
              {misconceptionGroups.map((group, idx) => {
                const severityBorder = {
                  high: 'border-l-4 border-l-red-400',
                  medium: 'border-l-4 border-l-amber-400',
                  low: 'border-l-4 border-l-amber-200',
                }[group.severity]

                const severityBadge = {
                  high: 'border-red-200 bg-red-100 text-red-700',
                  medium: 'border-amber-300 bg-amber-100 text-amber-700',
                  low: 'border-amber-200 bg-amber-50 text-amber-600',
                }[group.severity]

                return (
                  <div
                    key={group.misconception}
                    className={`px-5 py-4 transition-all duration-200 hover:bg-slate-50/50 ${severityBorder}`}
                    style={{ animation: `fadeSlideIn 0.3s ease-out ${idx * 0.04}s both` }}
                  >
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4">
                      {/* Misconception text + bar */}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-tight text-slate-900">
                          {group.misconception}
                        </p>
                        <div className="mt-2">
                          <SeverityBar
                            severity={group.severity}
                            count={group.count}
                            maxCount={maxMisconceptionCount}
                          />
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          Seen in:{' '}
                          {group.zones
                            .map((z) => ZONES.find((zone) => zone.number === z)?.name ?? `Z${z}`)
                            .join(' → ')}
                        </p>
                      </div>

                      {/* Zone chips */}
                      <div className="flex flex-wrap justify-center gap-1">
                        {group.zones.map((z) => (
                          <span
                            key={z}
                            className="flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600"
                          >
                            {z}
                          </span>
                        ))}
                      </div>

                      {/* Student count badge */}
                      <Badge
                        variant="outline"
                        className={`shrink-0 font-bold ${severityBadge}`}
                      >
                        {group.count}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Recent activity feed ──────────────────────────────────────────── */}
      {responses.length > 0 && (
        <section className="space-y-4 pb-8">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Activity className="size-4.5 text-indigo-500" />
            Recent Activity
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
            <div className="divide-y divide-slate-100/80">
              {responses.slice(0, 10).map((resp, idx) => {
                const session = sessions.find((s) => s.id === resp.session_id)
                const studentName =
                  session?.profiles?.full_name ??
                  session?.profiles?.email ??
                  'Student'

                return (
                  <div
                    key={resp.id}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/50"
                    style={{ animation: `fadeSlideIn 0.3s ease-out ${idx * 0.03}s both` }}
                  >
                    {/* Correct / incorrect icon */}
                    <div className="mt-0.5 shrink-0">
                      {resp.is_correct ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="size-4 text-amber-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">{studentName}</span>
                        {' '}answered Zone {resp.zone_number} ·{' '}
                        <span className={resp.is_correct ? 'text-emerald-600' : 'text-amber-600'}>
                          {resp.is_correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </p>
                      {resp.detected_misconception && (
                        <p className="mt-0.5 truncate text-[11px] text-amber-700">
                          ↳ {resp.detected_misconception}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatElapsed(resp.created_at)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
