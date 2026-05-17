import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { type PlannedSessionOut, useDeletePlannedSession } from '../../lib/planApi'
import { SkipNoteModal } from './SkipNoteModal'
import { RescheduleModal } from './RescheduleModal'
import { SessionComparisonPanel } from './SessionComparisonPanel'

interface PlannedSessionCardProps {
  session: PlannedSessionOut
  weekStart: string
  activityTypeMap: Map<number, string>
  isPast: boolean
  onEdit: () => void
}

function formatDistKm(metres: number | null): string | null {
  if (metres == null) return null
  const km = metres / 1000
  return km % 1 === 0 ? `${km} km` : `${parseFloat(km.toFixed(1))} km`
}

function buildSegmentSummary(segments: PlannedSessionOut['segments']): string {
  return segments
    .map((seg, i) => {
      const label = seg.title || `Segment ${i + 1}`
      const dist = formatDistKm(seg.distance_metres)
      return dist ? `${label} ${dist}` : label
    })
    .join(' · ')
}

function buildCardioTitle(
  activityTypeName: string | null,
  segments: PlannedSessionOut['segments'],
): string {
  const base = activityTypeName ?? 'Cardio'
  const totalMetres = segments.reduce((sum, seg) => sum + (seg.distance_metres ?? 0), 0)
  const totalSecs = segments.reduce((sum, seg) => sum + (seg.duration_secs ?? 0), 0)
  if (totalMetres > 0) {
    const km = totalMetres / 1000
    const kmStr = km % 1 === 0 ? String(km) : parseFloat(km.toFixed(1)).toString()
    return `${base} – ${kmStr} km`
  }
  if (totalSecs > 0) {
    return `${base} – ${Math.round(totalSecs / 60)} min`
  }
  return base
}

const statusBadgeClass = {
  planned: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
  skipped: 'bg-orange-50 text-orange-700',
}

const statusLabel = {
  planned: '○ Planned',
  done: '✓ Done',
  skipped: '✗ Skipped',
}

const typeBadgeClass = {
  strength: 'bg-violet-50 text-violet-700',
  cardio: 'bg-teal-50 text-teal-700',
}

export function PlannedSessionCard({
  session,
  weekStart,
  activityTypeMap,
  isPast,
  onEdit,
}: PlannedSessionCardProps) {
  const navigate = useNavigate()
  const [showSkipNoteModal, setShowSkipNoteModal] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const deleteMutation = useDeletePlannedSession()

  const activityTypeName =
    session.session_type === 'cardio' && session.activity_type_id != null
      ? (activityTypeMap.get(session.activity_type_id) ?? null)
      : null

  const segmentSummary =
    session.session_type === 'cardio' && session.segments.length > 0
      ? buildSegmentSummary(session.segments)
      : null

  function handleStart() {
    if (session.session_type === 'strength' && session.template_id) {
      navigate(`/log?type=strength&templateId=${session.template_id}`)
    } else if (session.session_type === 'cardio') {
      navigate(`/log?type=cardio&plannedSessionId=${session.id}&weekStart=${weekStart}`)
    }
  }

  function handleDelete() {
    deleteMutation.mutate(
      { weekStart, sessionId: session.id },
      { onSuccess: () => setConfirmDelete(false) }
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {session.title ??
                (session.session_type === 'cardio'
                  ? buildCardioTitle(activityTypeName, session.segments)
                  : 'Strength Session')}
            </p>
            {segmentSummary && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{segmentSummary}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                typeBadgeClass[session.session_type]
              }`}
            >
              {session.session_type === 'strength' ? 'Strength' : 'Cardio'}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                statusBadgeClass[session.status]
              }`}
            >
              {statusLabel[session.status]}
            </span>
          </div>
        </div>

        {/* Skip note display */}
        {session.status === 'skipped' && session.skip_note && (
          <p className="text-xs text-slate-500 mt-1.5 italic">"{session.skip_note}"</p>
        )}

        {/* Actions */}
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          {session.status === 'done' && session.matched_session_id != null && (
            <Link
              to={`/sessions/${session.matched_session_id}`}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              View session →
            </Link>
          )}
          {session.status === 'done' && (
            <button
              onClick={() => setComparisonOpen(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              {comparisonOpen ? '▾' : '▸'} Compare planned vs. actual
            </button>
          )}

          {session.status !== 'done' && (
            <>
              {/* Start — today/future planned only */}
              {!isPast && session.status === 'planned' && (
                <button
                  onClick={handleStart}
                  className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Start
                </button>
              )}

              {/* Skip note — skipped only */}
              {session.status === 'skipped' && (
                <button
                  onClick={() => setShowSkipNoteModal(true)}
                  className="text-xs text-slate-600 hover:text-slate-800 font-medium underline underline-offset-2"
                >
                  {session.skip_note ? 'Edit note' : 'Add note'}
                </button>
              )}

              {/* Reschedule */}
              <button
                onClick={() => setShowRescheduleModal(true)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                    clipRule="evenodd"
                  />
                </svg>
                Reschedule
              </button>

              {/* Edit / Swap */}
              <button
                onClick={onEdit}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                {session.status === 'skipped' ? 'Swap' : 'Edit'}
              </button>

              {/* Delete */}
              <div className="ml-auto">
                {confirmDelete ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-600">Delete?</span>
                    <button
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 font-medium hover:text-red-700 disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                    aria-label="Delete session"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {comparisonOpen && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <SessionComparisonPanel
              plannedSessionId={session.id}
              sessionType={session.session_type as 'cardio' | 'strength'}
            />
          </div>
        )}
      </div>

      {showSkipNoteModal && (
        <SkipNoteModal
          session={session}
          weekStart={weekStart}
          onClose={() => setShowSkipNoteModal(false)}
        />
      )}

      {showRescheduleModal && (
        <RescheduleModal
          session={session}
          weekStart={weekStart}
          onClose={() => setShowRescheduleModal(false)}
        />
      )}
    </>
  )
}
