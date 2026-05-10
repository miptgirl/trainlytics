import { useState } from 'react'
import { Layout } from '../components/Layout'
import { useSteps, useDeleteStep } from '../lib/hooks/useSteps'
import type { StepEntry } from '../lib/hooks/useSteps'
import StepsForm from '../components/StepsForm'

export default function StepsPage() {
  const { data: entries = [], isLoading } = useSteps()
  const deleteStep = useDeleteStep()
  const [editingEntry, setEditingEntry] = useState<StepEntry | null>(null)

  function handleEdit(entry: StepEntry) {
    setEditingEntry(entry)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingEntry(null)
  }

  async function handleDelete(entry: StepEntry) {
    if (!window.confirm(`Delete step entry for ${entry.date}?`)) return
    await deleteStep.mutateAsync(entry.id)
    if (editingEntry?.id === entry.id) setEditingEntry(null)
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6">
        <h1 className="text-2xl font-semibold mb-4">Daily Steps</h1>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">
              {editingEntry ? `Editing ${editingEntry.date}` : 'Add entry'}
            </h2>
            {editingEntry && (
              <button
                onClick={handleCancelEdit}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            )}
          </div>
          <StepsForm
            defaultValues={editingEntry ? { date: editingEntry.date, steps: editingEntry.steps } : undefined}
            onSuccess={handleCancelEdit}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-medium mb-3">All entries</h2>
          {isLoading ? (
            <p className="text-slate-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-slate-400">No step entries yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((e: StepEntry) => (
                <li
                  key={e.id}
                  className={`flex items-center justify-between py-3 first:pt-0 last:pb-0 ${editingEntry?.id === e.id ? 'bg-blue-50 -mx-5 px-5 rounded-xl' : ''}`}
                >
                  <div>
                    <div className="font-medium">{e.date}</div>
                    <div className="text-sm text-slate-500">{e.steps.toLocaleString()} steps</div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleEdit(e)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      disabled={deleteStep.isPending}
                      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      Delete
                    </button>
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

