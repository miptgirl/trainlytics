import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layout, MenuSheet, ProfileButton } from '../components/Layout'
import { SkipNoteModal } from '../components/plan/SkipNoteModal'
import { api } from '../lib/api'
import { TypeBadge, StatusBadge } from '../components/SessionBadges'
import { toLocalDateStr, formatShortDate, getMondayOf } from '../lib/dateUtils'
import { loadDraft } from '../lib/draftUtils'
import { draftStartedAt, formatDraftAge } from '../lib/draftAge'
import { summarizeWeek } from '../lib/planStats'
import { getStartUrl } from '../lib/planStart'
import { prefersWorkoutMode } from '../lib/workoutMode'
import { describeDraft, parseStrengthDraft, strengthViewUrl } from '../lib/strengthSession'
import {
  useWeekPlan,
  useUpdatePlannedSession,
  useUpdateSkipNote,
  type PlannedSessionOut,
} from '../lib/planApi'

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d)
}

function formatKm(metres: number | null): string | null {
  if (metres == null) return null
  const km = metres / 1000
  return `${km % 1 === 0 ? km : parseFloat(km.toFixed(1))} km`
}

function sessionTitle(s: PlannedSessionOut, typeName: string | null): string {
  if (s.title) return s.title
  return s.session_type === 'cardio' ? (typeName ?? 'Cardio') : 'Strength Session'
}

function sessionSummary(s: PlannedSessionOut): string | null {
  if (s.session_type !== 'cardio' || s.segments.length === 0) return null
  return s.segments
    .map((seg, i) => {
      const label = seg.title || `Segment ${i + 1}`
      const dist = formatKm(seg.distance_metres)
      return dist ? `${label} ${dist}` : label
    })
    .join(' · ')
}

/** Workout mode is the phone default; tracks the 768px breakpoint so links stay right after a resize. */
function useWorkoutView(): 'workout' | 'form' {
  const [workout, setWorkout] = useState(prefersWorkoutMode)
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 767px)')
    if (!mq) return
    const onChange = () => setWorkout(prefersWorkoutMode())
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return workout ? 'workout' : 'form'
}

/** Current date, refreshed when the app returns to the foreground and at midnight. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => setNow((prev) => {
      const next = new Date()
      return toLocalDateStr(prev) === toLocalDateStr(next) ? prev : next
    })
    const schedule = () => {
      const n = new Date()
      const midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1)
      timer = setTimeout(() => {
        refresh()
        schedule()
      }, midnight.getTime() - n.getTime())
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    schedule()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timer)
    }
  }, [])
  return now
}

const tileClass =
  'flex flex-col items-center justify-center gap-1 min-h-20 rounded-xl border border-border bg-surface text-sm font-medium text-text hover:bg-primary-tint transition-colors'

function TodaySessionCard({
  session,
  weekStart,
  typeName,
  canMoveToTomorrow,
  tomorrow,
  view,
}: {
  session: PlannedSessionOut
  weekStart: string
  typeName: string | null
  canMoveToTomorrow: boolean
  tomorrow: string
  view: 'workout' | 'form'
}) {
  const [skipOpen, setSkipOpen] = useState(false)
  const move = useUpdatePlannedSession()
  const summary = sessionSummary(session)
  const undo = useUpdateSkipNote()
  const done = session.status === 'done'
  const skipped = !done && !!session.skip_note?.trim()

  function moveToTomorrow() {
    move.mutate({
      weekStart,
      sessionId: session.id,
      body: {
        planned_date: tomorrow,
        session_type: session.session_type,
        template_id: session.template_id,
        activity_type_id: session.activity_type_id,
        title: session.title,
        notes: session.notes,
        display_order: session.display_order,
        segments: session.segments.map((seg) => ({
          segment_order: seg.segment_order,
          title: seg.title,
          duration_secs: seg.duration_secs,
          distance_metres: seg.distance_metres,
          pace_secs_per_km: seg.pace_secs_per_km,
          notes: seg.notes,
        })),
      },
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <TypeBadge type={session.session_type} />
        {done && <StatusBadge status="done" />}
        {skipped && <StatusBadge status="skipped" />}
      </div>
      <h2 className="text-base font-semibold text-text">{sessionTitle(session, typeName)}</h2>
      {summary && <p className="text-sm text-text-muted-strong mt-0.5">{summary}</p>}
      {(skipped || session.status === 'skipped') && session.skip_note && (
        <p className="text-sm text-text-muted-strong mt-1 italic">"{session.skip_note}"</p>
      )}

      {done ? (
        session.matched_session_id != null && (
          <Link
            to={`/sessions/${session.matched_session_id}`}
            className="inline-flex items-center min-h-11 mt-1 text-sm font-medium text-primary-dark"
          >
            View session →
          </Link>
        )
      ) : skipped ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => undo.mutate({ weekStart, sessionId: session.id, skip_note: null })}
            disabled={undo.isPending}
            className="inline-flex items-center justify-center min-h-11 px-3 -ml-3 rounded-xl text-sm font-medium text-primary-dark disabled:opacity-50"
          >
            {undo.isPending ? 'Undoing…' : 'Undo skip'}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to={getStartUrl(session, weekStart, { view })}
            className="inline-flex items-center justify-center min-h-11 px-5 rounded-xl bg-primary-dark text-white text-sm font-semibold"
          >
            Start
          </Link>
          {canMoveToTomorrow && (
            <button
              type="button"
              onClick={moveToTomorrow}
              disabled={move.isPending}
              className="inline-flex items-center justify-center min-h-11 px-3 rounded-xl text-sm font-medium text-text-muted-strong border border-border disabled:opacity-50"
            >
              {move.isPending ? 'Moving…' : 'Move to tomorrow'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSkipOpen(true)}
            className="inline-flex items-center justify-center min-h-11 px-3 rounded-xl text-sm font-medium text-text-muted-strong"
          >
            Skip
          </button>
        </div>
      )}
      {(move.isError || undo.isError) && (
        <p role="alert" className="text-sm text-error-text mt-2">
          Couldn't update the session. Try again.
        </p>
      )}

      {skipOpen && (
        <SkipNoteModal
          session={session}
          weekStart={weekStart}
          requireNote
          onClose={() => setSkipOpen(false)}
        />
      )}
    </div>
  )
}

export default function TodayPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const now = useNow()
  const view = useWorkoutView()
  const today = toLocalDateStr(now)
  const weekStart = getMondayOf(now)
  const tomorrow = addDays(today, 1)
  // Tomorrow belongs to the next plan on Sundays; the reschedule API only moves within a week
  const canMoveToTomorrow = getMondayOf(new Date(tomorrow + 'T00:00:00')) === weekStart

  const { data, isLoading, isError } = useWeekPlan(weekStart)
  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<{ id: number; name: string }[]>('/cardio-types'),
  })
  const typeMap = new Map(cardioTypes.map((t) => [t.id, t.name]))

  const sessions = data?.sessions ?? []
  const todays = sessions
    .filter((s) => s.planned_date === today)
    .sort((a, b) => a.display_order - b.display_order)
  const week = summarizeWeek(sessions)
  const next = sessions
    .filter((s) => s.status === 'planned' && s.planned_date > today)
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date) || a.display_order - b.display_order)[0]

  type ResumeCard = { type: 'strength' | 'cardio'; href: string; detail: string | null; age: string | null }
  const drafts = (['strength', 'cardio'] as const).flatMap((type): ResumeCard[] => {
    const raw = loadDraft(type)
    if (raw === null) return []
    if (type === 'strength') {
      const draft = parseStrengthDraft(raw)
      if (!draft) return []
      // Workout mode on phones, the full form from 768px; either restores the draft without asking
      const href = strengthViewUrl(
        view === 'workout' ? 'workout' : 'log',
        { templateId: draft.templateId ?? undefined },
        { resume: true },
      )
      const started = draft.workout.startedAt != null ? new Date(draft.workout.startedAt) : draftStartedAt(raw)
      return [{ type, href, detail: describeDraft(draft), age: started ? formatDraftAge(started, now) : null }]
    }
    const started = draftStartedAt(raw)
    return [{ type, href: '/log?type=cardio', detail: null, age: started ? formatDraftAge(started, now) : null }]
  })

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-text">{dateLabel}</h1>
          <ProfileButton onClick={() => setMenuOpen(true)} expanded={menuOpen} className="md:hidden -mr-2" />
        </div>

        {drafts.map(({ type, href, detail, age }) => (
          <Link
            key={type}
            to={href}
            className="flex items-center justify-between gap-3 min-h-14 px-4 py-3 rounded-xl border border-primary-light bg-primary-tint"
          >
            <span>
              <span className="block text-sm font-semibold text-primary-dark">
                Resume {type} workout
              </span>
              <span className="block text-xs text-text-muted-strong">
                {[detail, age].filter(Boolean).join(' · ') || 'You have an unsaved draft'}
              </span>
            </span>
            <span aria-hidden className="text-primary-dark">→</span>
          </Link>
        ))}

        {isLoading ? (
          <div className="h-28 rounded-xl bg-surface border border-border animate-pulse" />
        ) : isError ? (
          <p role="alert" className="text-sm text-error-text">Couldn't load today's plan.</p>
        ) : todays.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border px-4 py-5 text-sm text-text-muted-strong">
            Nothing planned today.
          </div>
        ) : (
          todays.map((s) => (
            <TodaySessionCard
              key={s.id}
              session={s}
              weekStart={weekStart}
              typeName={s.activity_type_id != null ? (typeMap.get(s.activity_type_id) ?? null) : null}
              canMoveToTomorrow={canMoveToTomorrow}
              tomorrow={tomorrow}
              view={view}
            />
          ))
        )}

        <section aria-label="Quick log">
          <h2 className="text-xs font-semibold text-text-muted-strong uppercase tracking-wide mb-2">
            Quick log
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Link to="/log?type=cardio" className={tileClass}>Cardio</Link>
            <Link
              to={view === 'workout' ? '/workout?type=strength' : '/log?type=strength'}
              className={tileClass}
            >
              Strength
            </Link>
            <Link to="/steps" className={tileClass}>Steps</Link>
          </div>
        </section>

        <section
          aria-label="This week"
          className="bg-surface rounded-xl border border-border shadow-sm p-4"
        >
          <h2 className="text-xs font-semibold text-text-muted-strong uppercase tracking-wide mb-2">
            This week
          </h2>
          {isLoading ? (
            <div className="h-10 animate-pulse" />
          ) : isError ? (
            <p role="alert" className="text-sm text-error-text">Couldn't load this week.</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-text-muted-strong">No sessions planned this week.</p>
          ) : (
            <>
              <p className="text-sm text-text">
                <span className="text-2xl font-semibold">{week.done}</span>
                <span className="text-text-muted-strong"> of {sessions.length} sessions done</span>
              </p>
              <div className="h-2 bg-primary-tint rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.round((week.done / sessions.length) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-text-muted-strong mt-2">
                {week.planned} planned · {week.skipped} skipped
                {week.completionPct !== null && ` · ${week.completionPct}% completion`}
              </p>
              <p className="text-sm text-text-muted-strong mt-3">
                {next
                  ? `Next: ${sessionTitle(next, next.activity_type_id != null ? (typeMap.get(next.activity_type_id) ?? null) : null)} · ${formatShortDate(next.planned_date)}`
                  : 'Nothing else planned this week'}
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/plan')}
            className="mt-1 inline-flex items-center min-h-11 text-sm font-medium text-primary-dark"
          >
            Open plan →
          </button>
        </section>
      </div>
      {/* Outside the space-y container so its margins don't shrink the overlay */}
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </Layout>
  )
}
