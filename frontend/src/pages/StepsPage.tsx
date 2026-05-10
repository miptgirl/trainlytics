import { useEffect } from 'react'
import { Layout } from '../components/Layout'
import { useForm } from 'react-hook-form'
import { useSteps, useUpsertStep } from '../lib/hooks/useSteps'

interface FormValues {
  date: string
  steps: number
}

export default function StepsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const { data: entries = [], isLoading } = useSteps()
  const upsert = useUpsertStep()
  const { register, handleSubmit, reset, setValue } = useForm<FormValues>({ defaultValues: { date: today, steps: 0 } })

  // editingId tracked implicitly by populating form; no explicit id needed in this MVP

  useEffect(() => {
    // when entries change, keep form default reasonably recent
    if (entries && entries.length > 0) {
      const latest = entries[0]
      setValue('date', latest.date)
    }
  }, [entries, setValue])

  async function onSubmit(values: FormValues) {
    try {
      await upsert.mutateAsync({ date: values.date, steps: Number(values.steps) })
      // reset to submitted date
      reset({ date: values.date, steps: values.steps })
      // form updated
    } catch (e) {
      // mutation displays errors via query/mutation state; keep UX simple for MVP
      console.error('Failed to upsert steps', e)
    }
  }

  function onEdit(entry: any) {
    setValue('date', entry.date)
    setValue('steps', entry.steps)
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6">
        <h1 className="text-2xl font-semibold mb-4">Daily Steps</h1>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm text-slate-600 block mb-1">Date</label>
              <input type="date" {...register('date', { required: true })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div className="w-36">
              <label className="text-sm text-slate-600 block mb-1">Steps</label>
              <input type="number" {...register('steps', { required: true, min: 0 })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                {upsert.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-medium mb-3">Recent entries</h2>
          {isLoading ? (
            <p className="text-slate-400">Loading</p>
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
