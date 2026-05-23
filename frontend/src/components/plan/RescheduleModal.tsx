import { useState } from 'react'
import { type PlannedSessionOut, useUpdatePlannedSession } from '../../lib/planApi'
import { toLocalDateStr } from '../../lib/dateUtils'

interface RescheduleModalProps {
  session: PlannedSessionOut
  weekStart: string
  onClose: () => void
}

function getDaysOfWeek(weekStart: string): string[] {
  const days: string[] = []
  const start = new Date(weekStart + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(toLocalDateStr(d))
  }
  return days
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function RescheduleModal({ session, weekStart, onClose }: RescheduleModalProps) {
  const today = toLocalDateStr(new Date())
  const days = getDaysOfWeek(weekStart)
  const [selectedDate, setSelectedDate] = useState(session.planned_date)
  const mutation = useUpdatePlannedSession()

  function handleConfirm() {
    if (selectedDate === session.planned_date) {
      onClose()
      return
    }
    mutation.mutate(
      {
        weekStart,
        sessionId: session.id,
        body: {
          planned_date: selectedDate,
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
      },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Reschedule session</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs text-slate-500 mb-3">Pick a day within this week:</p>
          <div className="space-y-1">
            {days.map((day) => {
              const isPast = day < today
              const isCurrent = day === session.planned_date
              const isSelected = day === selectedDate

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelectedDate(day)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    isPast
                      ? 'text-slate-300 cursor-not-allowed'
                      : isSelected
                        ? 'bg-blue-600 text-white font-medium'
                        : isCurrent
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {formatDate(day)}
                  {isCurrent && !isSelected && (
                    <span className="ml-2 text-xs opacity-60">(current)</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Moving…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
