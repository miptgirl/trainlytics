import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { datetimeLocalToUTC, formatSessionDateTime, toDatetimeLocal } from '../lib/dateUtils'
import { kmToMetres, metresToKm, minPerKmToSecPerKm, minsToSeconds, secPerKmToMinPerKm, secondsToMins } from '../lib/unitUtils'

interface CardioType {
  id: number
  name: string
}

interface CardioSegment {
  id: number
  order: number
  title: string | null
  duration_seconds: number
  distance_meters: number | null
  pace_seconds_per_km: number | null
  heart_rate_avg: number | null
}

interface CardioSession {
  id: number
  activity_type_id: number | null
  title: string | null
  total_duration_seconds: number | null
  date: string
  notes: string | null
  calories: number | null
  created_at: string
  segments: CardioSegment[]
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`
  return `${s}s`
}

// ──────────────────────────────────────────
// Edit form types (reused from log page)
// ──────────────────────────────────────────
interface SegmentFormValues {
  title: string
  duration_mins: string
  distance_km: string
  pace_min_per_km: string
  heart_rate_avg: string
}

interface EditFormValues {
  title: string
  activity_type_id: string
  date: string
  notes: string
  total_duration_mins: string
  calories: string
  segments: SegmentFormValues[]
}

function toForm(session: CardioSession): EditFormValues {
  return {
    title: session.title ?? '',
    activity_type_id: session.activity_type_id?.toString() ?? '',
    date: toDatetimeLocal(session.date),
    notes: session.notes ?? '',
    total_duration_mins: session.total_duration_seconds != null
      ? String(Math.round(secondsToMins(session.total_duration_seconds) * 10) / 10)
      : '',
    calories: session.calories?.toString() ?? '',
    segments: session.segments.map((seg) => ({
      title: seg.title ?? '',
      duration_mins: String(Math.round(secondsToMins(seg.duration_seconds) * 10) / 10),
      distance_km: seg.distance_meters != null ? String(metresToKm(seg.distance_meters)) : '',
      pace_min_per_km: seg.pace_seconds_per_km != null
        ? String(Math.round(secondsToMins(seg.pace_seconds_per_km) * 100) / 100)
        : '',
      heart_rate_avg: seg.heart_rate_avg?.toString() ?? '',
    })),
  }
}

function parseIntOrNull(val: string): number | null {
  const n = Number(val)
  return isNaN(n) || val.trim() === '' ? null : Math.round(n)
}

// ──────────────────────────────────────────
// Edit form component
// ──────────────────────────────────────────
function EditForm({
  session,
  cardioTypes,
  onSave,
  onCancel,
  isPending,
}: {
  session: CardioSession
  cardioTypes: CardioType[]
  onSave: (data: EditFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: toForm(session),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'segments' })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            placeholder="Optional session title…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('title')}
          />
        </div>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('date', { required: 'Date is required' })}
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Total Duration (mins override)</label>
          <input
            type="number"
            min="0"
            step="any"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('total_duration_mins')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal, optional)</label>
          <input
            type="number"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('calories')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            {...register('notes')}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Segments</h2>
          <button
            type="button"
            onClick={() => append({ title: '', duration_mins: '', distance_km: '', pace_min_per_km: '', heart_rate_avg: '' })}
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
                  <button type="button" onClick={() => remove(index)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Segment Title</label>
                  <input type="text" placeholder="Optional title…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.title`)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Duration (mins) *</label>
                  <input
                    type="number" min="0" step="any"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.duration_mins`, { required: 'Required' })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Distance (km)</label>
                  <input type="number" min="0" step="any"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.distance_km`)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pace (min/km)</label>
                  <input type="number" min="0" step="any"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.pace_min_per_km`)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Avg HR (bpm)</label>
                  <input type="number" min="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.heart_rate_avg`)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────
// Main detail page
// ──────────────────────────────────────────
export default function CardioSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const sessionId = Number(id)

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => api.get<CardioSession>(`/sessions/${sessionId}`),
  })

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: EditFormValues) => {
      const totalDurMins = parseFloat(data.total_duration_mins)
      const payload = {
        title: data.title || null,
        activity_type_id: data.activity_type_id ? parseIntOrNull(data.activity_type_id) : null,
        date: datetimeLocalToUTC(data.date),
        notes: data.notes || null,
        calories: data.calories ? parseInt(data.calories, 10) : null,
        total_duration_seconds: !isNaN(totalDurMins) ? minsToSeconds(totalDurMins) : null,
        segments: data.segments.map((seg, i) => {
          const durMins = parseFloat(seg.duration_mins)
          const distKm = parseFloat(seg.distance_km)
          const paceMpk = parseFloat(seg.pace_min_per_km)
          return {
            order: i + 1,
            title: seg.title || null,
            duration_seconds: !isNaN(durMins) ? minsToSeconds(durMins) : null,
            distance_meters: !isNaN(distKm) ? kmToMetres(distKm) : null,
            pace_seconds_per_km: !isNaN(paceMpk) ? minPerKmToSecPerKm(paceMpk) : null,
            heart_rate_avg: parseIntOrNull(seg.heart_rate_avg),
          }
        }),
      }
      return api.patch<CardioSession>(`/sessions/${sessionId}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', sessionId] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete<void>(`/sessions/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/', { replace: true })
    },
  })

  if (sessionLoading) {
    return <Layout><p className="text-gray-400 text-sm">Loading…</p></Layout>
  }

  if (!session) {
    return <Layout><p className="text-gray-500 text-sm">Session not found.</p></Layout>
  }

  const typeName = cardioTypes.find((t) => t.id === session.activity_type_id)?.name ?? '—'
  const totalDur = session.total_duration_seconds
    ?? session.segments.reduce((sum, s) => sum + s.duration_seconds, 0)

  if (editing) {
    return (
      <Layout>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Edit Session</h1>
        </div>
        <EditForm
          session={session}
          cardioTypes={cardioTypes}
          onSave={(data) => updateMutation.mutate(data)}
          onCancel={() => setEditing(false)}
          isPending={updateMutation.isPending}
        />
        {updateMutation.error && (
          <p className="mt-4 text-sm text-red-600">{updateMutation.error.message}</p>
        )}
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cardio Session</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this session?')) deleteMutation.mutate()
            }}
            disabled={deleteMutation.isPending}
            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 mb-6">
        {session.title && (
          <div className="pb-2 border-b border-gray-100">
            <p className="text-base font-semibold text-gray-900">{session.title}</p>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Date</span>
          <span className="font-medium text-gray-900">{formatSessionDateTime(session.date)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Activity</span>
          <span className="font-medium text-gray-900">{typeName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Duration</span>
          <span className="font-medium text-gray-900">{formatDuration(totalDur)}</span>
        </div>
        {session.calories != null && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Calories</span>
            <span className="font-medium text-gray-900">{session.calories} kcal</span>
          </div>
        )}
        {session.notes && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-600">{session.notes}</p>
          </div>
        )}
      </div>

      {/* Segments */}
      <h2 className="font-medium text-gray-900 mb-3">
        Segments ({session.segments.length})
      </h2>
      <div className="space-y-3">
        {session.segments.map((seg, i) => (
          <div key={seg.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              {seg.title ? seg.title : `Segment ${i + 1}`}
            </p>
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-gray-500">Duration</span>
              <span className="font-medium">{formatDuration(seg.duration_seconds)}</span>
              {seg.distance_meters != null && (
                <>
                  <span className="text-gray-500">Distance</span>
                  <span className="font-medium">{metresToKm(seg.distance_meters).toFixed(2)} km</span>
                </>
              )}
              {seg.pace_seconds_per_km != null && (
                <>
                  <span className="text-gray-500">Pace</span>
                  <span className="font-medium">{secPerKmToMinPerKm(seg.pace_seconds_per_km)}</span>
                </>
              )}
              {seg.heart_rate_avg != null && (
                <>
                  <span className="text-gray-500">Avg HR</span>
                  <span className="font-medium">{seg.heart_rate_avg} bpm</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
