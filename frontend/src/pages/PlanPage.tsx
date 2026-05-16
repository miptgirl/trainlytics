import { useState } from 'react'
import { Layout } from '../components/Layout'
import { WeekGrid } from '../components/plan/WeekGrid'
import { PlanSessionForm } from '../components/plan/PlanSessionForm'
import { useWeekPlan, type PlannedSessionOut } from '../lib/planApi'

function getMondayOfCurrentWeek(): string {
  const today = new Date()
  const day = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

function shiftWeek(weekStart: string, direction: -1 | 1): string {
  const date = new Date(weekStart + 'T00:00:00')
  date.setDate(date.getDate() + direction * 7)
  return date.toISOString().split('T')[0]
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startMonth = start.toLocaleDateString('en-US', { month: 'long' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' })
  const year = end.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`
}

interface FormModal {
  open: boolean
  date: string
  session: PlannedSessionOut | null
}

export default function PlanPage() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek)
  const { data, isLoading } = useWeekPlan(weekStart)
  const [formModal, setFormModal] = useState<FormModal>({
    open: false,
    date: getMondayOfCurrentWeek(),
    session: null,
  })

  function handleAddSession(date: string) {
    setFormModal({ open: true, date, session: null })
  }

  function handleEditSession(session: PlannedSessionOut) {
    setFormModal({ open: true, date: session.planned_date, session })
  }

  function handleCloseForm() {
    setFormModal((prev) => ({ ...prev, open: false }))
  }

  return (
    <Layout>
      {formModal.open && (
        <PlanSessionForm
          weekStart={weekStart}
          initialDate={formModal.date}
          editingSession={formModal.session ?? undefined}
          onClose={handleCloseForm}
        />
      )}
      <div className="space-y-6">
        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
            className="p-2 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors"
            aria-label="Previous week"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-slate-800">{formatWeekRange(weekStart)}</h1>
          <button
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
            className="p-2 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors"
            aria-label="Next week"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Week grid */}
        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-40 mb-2" />
                <div className="h-16 bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <WeekGrid
            weekStart={weekStart}
            sessions={data?.sessions ?? []}
            onAddSession={handleAddSession}
            onEditSession={handleEditSession}
          />
        )}
      </div>
    </Layout>
  )
}
