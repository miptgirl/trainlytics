import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type PlannedSessionOut } from '../../lib/planApi'
import { toLocalDateStr } from '../../lib/dateUtils'
import { PlannedSessionCard } from './PlannedSessionCard'

interface CardioType {
  id: number
  name: string
}

interface WeekGridProps {
  weekStart: string
  sessions: PlannedSessionOut[]
  onAddSession: (date: string) => void
  onEditSession: (session: PlannedSessionOut) => void
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

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function WeekGrid({ weekStart, sessions, onAddSession, onEditSession }: WeekGridProps) {
  const today = toLocalDateStr(new Date())
  const days = getDaysOfWeek(weekStart)

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardioTypes'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
    staleTime: Infinity,
  })

  const activityTypeMap = new Map(cardioTypes.map((t) => [t.id, t.name]))

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const daySessions = sessions
          .filter((s) => s.planned_date === day)
          .sort((a, b) => a.display_order - b.display_order)
        const isPast = day < today
        const isToday = day === today

        return (
          <div key={day}>
            <div
              className={`flex items-center gap-2 mb-2 text-sm font-semibold ${
                isToday ? 'text-blue-600' : isPast ? 'text-slate-400' : 'text-slate-700'
              }`}
            >
              {isToday && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
              {formatDayHeader(day)}
            </div>

            <div className="space-y-2 pl-4 border-l-2 border-slate-100">
              {daySessions.map((session) => (
                <PlannedSessionCard
                  key={session.id}
                  session={session}
                  weekStart={weekStart}
                  activityTypeMap={activityTypeMap}
                  onEdit={() => onEditSession(session)}
                />
              ))}

              <button
                onClick={() => onAddSession(day)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  isPast
                    ? 'text-slate-400 border-slate-200 hover:bg-slate-50'
                    : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Add session
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
