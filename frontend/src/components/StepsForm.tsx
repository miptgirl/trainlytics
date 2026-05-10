import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useUpsertStep } from '../lib/hooks/useSteps'

interface FormValues {
  date: string
  steps: number
}

interface StepsFormProps {
  compact?: boolean
  defaultValues?: { date: string; steps: number }
  onSuccess?: () => void
}

export default function StepsForm({ compact = false, defaultValues, onSuccess }: StepsFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const upsert = useUpsertStep()
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: defaultValues ?? { date: today, steps: 0 },
  })

  useEffect(() => {
    if (defaultValues) {
      reset(defaultValues)
    } else {
      reset({ date: today, steps: 0 })
    }
  }, [defaultValues?.date, defaultValues?.steps])

  async function onSubmit(values: FormValues) {
    setSaved(false)
    try {
      await upsert.mutateAsync({ date: values.date, steps: values.steps })
      reset({ date: today, steps: 0 })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSuccess?.()
    } catch (e) {
      console.error('Failed to upsert steps', e)
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={compact ? 'flex items-end gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-end'}
      >
        <div className="flex-1">
          <label className="text-sm text-slate-600 block mb-1">Date</label>
          <input
            type="date"
            {...register('date', { required: 'Date is required' })}
            className="w-full border rounded-lg px-3 py-2"
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
        </div>
        <div className={compact ? 'w-32' : 'w-36'}>
          <label className="text-sm text-slate-600 block mb-1">Steps</label>
          <input
            type="number"
            min={0}
            {...register('steps', { required: 'Steps required', min: { value: 0, message: 'Must be ≥ 0' }, valueAsNumber: true })}
            className="w-full border rounded-lg px-3 py-2"
          />
          {errors.steps && <p className="mt-1 text-xs text-red-600">{errors.steps.message}</p>}
        </div>
        <div className="shrink-0">
          <button
            type="submit"
            disabled={upsert.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
          >
            {upsert.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {saved && (
        <p className="text-sm text-green-600 font-medium">✓ Steps saved!</p>
      )}
      {upsert.isError && (
        <p className="text-sm text-red-600">
          {upsert.error instanceof Error ? upsert.error.message : 'Failed to save steps. Try again.'}
        </p>
      )}
    </div>
  )
}
