import { useState } from 'react'
import { Layout } from '../components/Layout'
import { WeekGrid } from '../components/plan/WeekGrid'
import { PlanSessionForm } from '../components/plan/PlanSessionForm'
import { WeeklyOverviewCard } from '../components/plan/WeeklyOverviewCard'
import { useWeekPlan, useCopyFromLastWeek, type PlannedSessionOut } from '../lib/planApi'

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
  const copyFromLastWeek = useCopyFromLastWeek()
  const [toast, setToast] = useState<string | null>(null)
  const [formModal, setFormModal] = useState<FormModal>({
    open: false,
    date: getMondayOfCurrentWeek(),
    session: null,
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleCopyFromLastWeek() {
    copyFromLastWeek.mutate(weekStart, {
      onError: (err) => {
        const msg = err instanceof Error ? err.message : 'Failed to copy plan'
        showToast(msg)
      },
    })
  }

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

        {/* Weekly overview */}
        <WeeklyOverviewCard sessions={data?.sessions ?? []} isLoading={isLoading} />

        {/* Copy from last week — only when the week is empty */}
        {!isLoading && (data?.sessions ?? []).length === 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleCopyFromLastWeek}
              disabled={copyFromLastWeek.isPending}
              className="flex items-center gap-2 text-sm text-slate-600 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {copyFromLastWeek.isPending ? (
                <svg
                  className="animate-spin h-4 w-4 text-slate-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
              )}
              Copy from last week
            </button>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

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
