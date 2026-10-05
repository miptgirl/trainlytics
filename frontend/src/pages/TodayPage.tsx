import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layout, MenuSheet, ProfileButton } from '../components/Layout'
import { SkipNoteModal } from '../components/plan/SkipNoteModal'
import { api } from '../lib/api'
import { toLocalDateStr, formatShortDate } from '../lib/dateUtils'
import { loadDraft } from '../lib/draftUtils'
import { getStartUrl } from '../lib/planStart'
import { useWeekPlan, useUpdatePlannedSession, type PlannedSessionOut } from '../lib/planApi'

function getMonday(d: Date): string {
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return toLocalDateStr(monday)
}

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

const typeBadgeClass = 'bg-primary-tint text-primary-dark'
const tileClass =
  'flex flex-col items-center justify-center gap-1 min-h-20 rounded-xl border border-border bg-surface text-sm font-medium text-text hover:bg-primary-tint transition-colors'

function TodaySessionCard({
  session,
  weekStart,
  typeName,
  canMoveToTomorrow,
  tomorrow,
}: {
  session: PlannedSessionOut
  weekStart: string
  typeName: string | null
  canMoveToTomorrow: boolean
  tomorrow: string
}) {
  const [skipOpen, setSkipOpen] = useState(false)
  const move = useUpdatePlannedSession()
  const summary = sessionSummary(session)
  const done = session.status === 'done'

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
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadgeClass}`}>
          {session.session_type === 'strength' ? 'Strength' : 'Cardio'}
        </span>
        {done && <span className="text-xs font-medium text-success-text">✓ Done</span>}
      </div>
      <h2 className="text-base font-semibold text-text">{sessionTitle(session, typeName)}</h2>
      {summary && <p className="text-sm text-text-muted-strong mt-0.5">{summary}</p>}
      {session.status === 'skipped' && session.skip_note && (
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
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to={getStartUrl(session, weekStart)}
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
      {move.isError && (
        <p role="alert" className="text-sm text-error-text mt-2">
          Couldn't move the session. Try again.
        </p>
      )}

      {skipOpen && (
        <SkipNoteModal session={session} weekStart={weekStart} onClose={() => setSkipOpen(false)} />
      )}
    </div>
  )
}

export default function TodayPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const now = new Date()
  const today = toLocalDateStr(now)
  const weekStart = getMonday(now)
  const tomorrow = addDays(today, 1)
  // Tomorrow belongs to the next plan on Sundays; the reschedule API only moves within a week
  const canMoveToTomorrow = getMonday(new Date(tomorrow + 'T00:00:00')) === weekStart

  const { data, isLoading, isError } = useWeekPlan(weekStart)
  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardioTypes'],
    queryFn: () => api.get<{ id: number; name: string }[]>('/cardio-types'),
    staleTime: Infinity,
  })
  const typeMap = new Map(cardioTypes.map((t) => [t.id, t.name]))

  const sessions = data?.sessions ?? []
  const todays = sessions
    .filter((s) => s.planned_date === today)
    .sort((a, b) => a.display_order - b.display_order)
  const doneCount = sessions.filter((s) => s.status === 'done').length
  const next = sessions
    .filter((s) => s.status === 'planned' && s.planned_date > today)
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date) || a.display_order - b.display_order)[0]

  const strengthDraft = loadDraft('strength') !== null
  const cardioDraft = loadDraft('cardio') !== null
  const resumeType = strengthDraft ? 'strength' : cardioDraft ? 'cardio' : null

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-text">{dateLabel}</h1>
          <ProfileButton onClick={() => setMenuOpen(true)} className="md:hidden -mr-2" />
        </div>

        {resumeType && (
          <Link
            to={`/log?type=${resumeType}`}
            className="flex items-center justify-between gap-3 min-h-14 px-4 py-3 rounded-xl border border-primary-light bg-primary-tint"
          >
            <span>
              <span className="block text-sm font-semibold text-primary-dark">
                Resume {resumeType} workout
              </span>
              <span className="block text-xs text-text-muted-strong">You have an unsaved draft</span>
            </span>
            <span aria-hidden className="text-primary-dark">→</span>
          </Link>
        )}

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
            />
          ))
        )}

        <section aria-label="Quick log">
          <h2 className="text-xs font-semibold text-text-muted-strong uppercase tracking-wide mb-2">
            Quick log
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Link to="/log?type=cardio" className={tileClass}>Cardio</Link>
            <Link to="/log?type=strength" className={tileClass}>Strength</Link>
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
          ) : (
            <>
              <p className="text-sm text-text">
                <span className="text-2xl font-semibold">{doneCount}</span>
                <span className="text-text-muted-strong"> of {sessions.length} sessions done</span>
              </p>
              <div className="h-2 bg-bg rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-success rounded-full"
                  style={{ width: `${sessions.length ? Math.round((doneCount / sessions.length) * 100) : 0}%` }}
                />
              </div>
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
