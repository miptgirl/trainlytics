import { useEffect } from 'react'
import { Layout } from '../components/Layout'
import { useSteps } from '../lib/hooks/useSteps'
import StepsForm from '../components/StepsForm'

export default function StepsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const { data: entries = [], isLoading } = useSteps()

  // editingId tracked implicitly by populating form; no explicit id needed in this MVP

  useEffect(() => {
    // when entries change, no-op here; StepsForm handles submission and resetting
  }, [entries])

  function onEdit(entry: any) {
    // StepsForm is uncontrolled from here; for MVP keep StepsPage simple (editing via clicking fills form in original implementation)
    // A future improvement could lift state so StepsForm can be programmatically populated
    const el = document.querySelector('input[type=date]') as HTMLInputElement | null
    const stepsEl = document.querySelector('input[type=number]') as HTMLInputElement | null
    if (el) el.value = entry.date
    if (stepsEl) stepsEl.value = String(entry.steps)
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6">
        <h1 className="text-2xl font-semibold mb-4">Daily Steps</h1>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <StepsForm />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-medium mb-3">Recent entries</h2>
          {isLoading ? (
            <p className="text-slate-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-slate-400">No step entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e: any) => (
                <li key={e.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{e.date}</div>
                    <div className="text-sm text-slate-500">{e.steps.toLocaleString()} steps</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(e)} className="text-sm text-slate-600 hover:text-slate-900">Edit</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  )
}
