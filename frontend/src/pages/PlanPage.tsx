import { useState } from 'react'
import { Layout } from '../components/Layout'
import { WeekGrid } from '../components/plan/WeekGrid'
import { PlanSessionForm } from '../components/plan/PlanSessionForm'
import { WeeklyOverviewCard } from '../components/plan/WeeklyOverviewCard'
import { useWeekPlan, useCopyFromLastWeek, type PlannedSessionOut } from '../lib/planApi'
import { PlanVsActualCard } from '../components/plan/PlanVsActualCard'
import { toLocalDateStr, getMondayOfCurrentWeek } from '../lib/dateUtils'

function shiftWeek(weekStart: string, direction: -1 | 1): string {
  const date = new Date(weekStart + 'T00:00:00')
  date.setDate(date.getDate() + direction * 7)
  return toLocalDateStr(date)
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

/** Compact range for narrow screens, e.g. "Sep 28 – Oct 4". */
function formatWeekRangeShort(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })

  if (startMonth === endMonth) return `${startMonth} ${start.getDate()} – ${end.getDate()}`
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`
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
            className="flex items-center justify-center p-2 max-md:min-h-11 max-md:min-w-11 rounded hover:bg-bg text-text-muted-strong hover:text-primary-dark transition-colors"
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
          <h1 className="text-lg font-semibold text-text whitespace-nowrap">
            <span className="sm:hidden">{formatWeekRangeShort(weekStart)}</span>
            <span className="hidden sm:inline">{formatWeekRange(weekStart)}</span>
          </h1>
          <button
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
            className="flex items-center justify-center p-2 max-md:min-h-11 max-md:min-w-11 rounded hover:bg-bg text-text-muted-strong hover:text-primary-dark transition-colors"
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

        {/* Plan vs. Actual */}
        <PlanVsActualCard weekStart={weekStart} />

        {/* Copy from last week — only when the week is empty */}
        {!isLoading && (data?.sessions ?? []).length === 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleCopyFromLastWeek}
              disabled={copyFromLastWeek.isPending}
              className="flex items-center gap-2 text-sm text-text-muted-strong border border-border rounded-lg px-4 py-2 hover:bg-bg transition-colors disabled:opacity-50"
            >
              {copyFromLastWeek.isPending ? (
                <svg
                  className="animate-spin h-4 w-4 text-text-muted-strong"
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
          <div className="fixed bottom-6 max-md:bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 bg-text text-white text-sm px-4 py-2.5 rounded-lg shadow-md">
            {toast}
          </div>
        )}

        {/* Week grid */}
        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-border rounded w-40 mb-2" />
                <div className="h-16 bg-bg rounded-xl" />
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
