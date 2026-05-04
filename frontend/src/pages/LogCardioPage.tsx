import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

interface CardioType {
  id: number
  name: string
}

interface SegmentFormValues {
  duration_seconds: string
  distance_meters: string
  pace_seconds_per_km: string
  heart_rate_avg: string
}

interface FormValues {
  activity_type_id: string
  date: string
  notes: string
  total_duration_seconds: string
  segments: SegmentFormValues[]
}

function formatSecondsInput(val: string): number | undefined {
  const n = parseInt(val, 10)
  return isNaN(n) || n <= 0 ? undefined : n
}

function formatFloatInput(val: string): number | undefined {
  const n = parseFloat(val)
  return isNaN(n) ? undefined : n
}

export default function LogCardioPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      activity_type_id: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      total_duration_seconds: '',
      segments: [{ duration_seconds: '', distance_meters: '', pace_seconds_per_km: '', heart_rate_avg: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'segments' })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload = {
        activity_type_id: data.activity_type_id ? parseInt(data.activity_type_id, 10) : null,
        date: data.date,
        notes: data.notes || null,
        total_duration_seconds: formatSecondsInput(data.total_duration_seconds) ?? null,
        segments: data.segments.map((seg, i) => ({
          order: i + 1,
          duration_seconds: parseInt(seg.duration_seconds, 10),
          distance_meters: formatFloatInput(seg.distance_meters) ?? null,
          pace_seconds_per_km: formatFloatInput(seg.pace_seconds_per_km) ?? null,
          heart_rate_avg: formatSecondsInput(seg.heart_rate_avg) ?? null,
        })),
      }
      return api.post<{ id: number }>('/sessions/cardio', payload)
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Log Cardio Session</h1>
      </div>

      <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
        {/* Basic fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('activity_type_id')}
            >
              <option value="">— select type —</option>
              {cardioTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('date', { required: 'Date is required' })}
            />
            {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Duration (seconds, optional override)</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 3600"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('total_duration_seconds')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              {...register('notes')}
            />
          </div>
        </div>

        {/* Segments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Segments</h2>
            <button
              type="button"
              onClick={() => append({ duration_seconds: '', distance_meters: '', pace_seconds_per_km: '', heart_rate_avg: '' })}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Segment
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Segment {index + 1}</span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Duration (sec) *</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 1800"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      {...register(`segments.${index}.duration_seconds`, { required: 'Required' })}
                    />
                    {errors.segments?.[index]?.duration_seconds && (
                      <p className="mt-0.5 text-xs text-red-600">{errors.segments[index]?.duration_seconds?.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Distance (m)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 5000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      {...register(`segments.${index}.distance_meters`)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Pace (sec/km)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 360"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      {...register(`segments.${index}.pace_seconds_per_km`)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Avg Heart Rate (bpm)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 145"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      {...register(`segments.${index}.heart_rate_avg`)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {createMutation.error && (
          <p className="text-sm text-red-600">{createMutation.error.message}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm"
          >
            {createMutation.isPending ? 'Saving…' : 'Save Session'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </Layout>
  )
}
