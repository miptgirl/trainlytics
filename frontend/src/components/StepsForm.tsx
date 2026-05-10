import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useUpsertStep } from '../lib/hooks/useSteps'

interface FormValues {
  date: string
  steps: number
}

export default function StepsForm({ compact = false }: { compact?: boolean }) {
  const today = new Date().toISOString().slice(0, 10)
  const upsert = useUpsertStep()
  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { date: today, steps: 0 } })

  useEffect(() => {
    // noop for compact form; callers may manage defaults
  }, [])

  async function onSubmit(values: FormValues) {
    try {
      await upsert.mutateAsync({ date: values.date, steps: Number(values.steps) })
      reset({ date: values.date, steps: values.steps })
    } catch (e) {
      console.error('Failed to upsert steps', e)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={compact ? 'flex items-center gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-end'}>
      <div className={compact ? 'flex-1' : 'flex-1'}>
        <label className="text-sm text-slate-600 block mb-1">Date</label>
        <input type="date" {...register('date', { required: true })} className="w-full border rounded-lg px-3 py-2" />
      </div>
      <div className={compact ? 'w-32' : 'w-36'}>
        <label className="text-sm text-slate-600 block mb-1">Steps</label>
        <input type="number" {...register('steps', { required: true, min: 0 })} className="w-full border rounded-lg px-3 py-2" />
      </div>
      <div>
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
          {upsert.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
