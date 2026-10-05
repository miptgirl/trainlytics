import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { datetimeLocalToUTC, formatSessionDateTime, toDatetimeLocal } from '../lib/dateUtils'
import { formatStrengthSession } from '../lib/exportUtils'
import { EmojiRating, EmojiRatingDisplay } from '../components/EmojiRating'
import { WELLBEING_OPTIONS, RPE_OPTIONS } from '../components/emojiRatingOptions'
import { StrengthExerciseList } from '../components/StrengthExerciseList'
import type { ExerciseEntryFormValues, ExerciseOption } from '../components/ExerciseEntryBlock'

interface StrengthSet {
  id: number
  set_number: number
  reps: number | null
  weight: number | null
  notes: string | null
}

interface StrengthExerciseEntry {
  id: number
  exercise_id: number
  exercise_name: string
  order: number
  sets: StrengthSet[]
}

interface StrengthSession {
  id: number
  type: string
  date: string
  title: string | null
  duration_seconds: number | null
  calories: number | null
  notes: string | null
  wellbeing: number | null
  rpe: number | null
  created_at: string
  exercises: StrengthExerciseEntry[]
}

// ── Edit form types ──────────────────────────────────────────────────────────

interface EditFormValues {
  title: string
  duration_minutes: string
  calories: string
  date: string
  notes: string
  wellbeing: number | null
  rpe: number | null
  exercises: ExerciseEntryFormValues[]
}

function toForm(session: StrengthSession): EditFormValues {
  return {
    title: session.title ?? '',
    duration_minutes: session.duration_seconds != null ? String(Math.round(session.duration_seconds / 60)) : '',
    calories: session.calories?.toString() ?? '',
    date: toDatetimeLocal(session.date),
    notes: session.notes ?? '',
    wellbeing: session.wellbeing ?? null,
    rpe: session.rpe ?? null,
    exercises: session.exercises.map((entry) => ({
      exercise_id: entry.exercise_id.toString(),
      sets: entry.sets.map((s) => ({
        reps: s.reps?.toString() ?? '',
        weight: s.weight?.toString() ?? '',
        notes: s.notes ?? '',
        done: false,
      })),
    })),
  }
}

// ── Edit form component ──────────────────────────────────────────────────────

function EditForm({
  session,
  exercises,
  onSave,
  onCancel,
  isPending,
}: {
  session: StrengthSession
  exercises: ExerciseOption[]
  onSave: (data: EditFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: toForm(session),
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Title</label>
          <input
            type="text"
            placeholder="Optional session title…"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('title')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('date', { required: 'Date is required' })}
          />
          {errors.date && <p className="mt-1 text-xs text-error-text">{errors.date.message}</p>}
        </div>
        <Controller
          control={control}
          name="wellbeing"
          render={({ field }) => (
            <EmojiRating
              label="How are you feeling?"
              options={WELLBEING_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="rpe"
          render={({ field }) => (
            <EmojiRating
              label="How hard was that?"
              options={RPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <label className="block text-sm font-medium text-text mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark resize-none"
            {...register('notes')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Duration (mins)</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Optional, e.g. 60"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('duration_minutes')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Calories (kcal, optional)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 500"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('calories')}
          />
        </div>
      </div>

      <StrengthExerciseList
        control={control}
        register={register}
        setValue={setValue}
        errors={errors}
        exercises={exercises}
        showDone={false}
        prefillFromLastSession={false}
      />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-primary-dark text-white py-2.5 rounded-xl text-sm font-medium hover:brightness-95 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-text hover:bg-bg"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StrengthSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => api.get<StrengthSession>(`/sessions/${id}`),
  })

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<ExerciseOption[]>('/exercises'),
    enabled: editing,
  })

  const updateMutation = useMutation({
    mutationFn: (data: EditFormValues) => {
      const payload = {
        title: data.title || null,
        duration_seconds: data.duration_minutes ? Math.round(parseFloat(data.duration_minutes) * 60) : null,
        calories: data.calories ? parseInt(data.calories, 10) : null,
        date: datetimeLocalToUTC(data.date),
        notes: data.notes || null,
        wellbeing: data.wellbeing,
        rpe: data.rpe,
        exercises: data.exercises.map((entry, i) => ({
          exercise_id: parseInt(entry.exercise_id, 10),
          order: i + 1,
          sets: entry.sets.map((s, si) => ({
            set_number: si + 1,
            reps: s.reps ? parseInt(s.reps, 10) : null,
            weight: s.weight ? parseFloat(s.weight) : null,
            notes: s.notes || null,
          })),
        })),
      }
      return api.patch<StrengthSession>(`/sessions/${id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/sessions/${id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['sessions', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/')
    },
  })

  if (isLoading) {
    return (
      <Layout>
        <p className="text-text-muted-strong text-sm">Loading…</p>
      </Layout>
    )
  }

  if (isError || !session) {
    return (
      <Layout>
        <p className="text-error-text text-sm">Session not found.</p>
      </Layout>
    )
  }

  async function handleCopy() {
    const text = formatStrengthSession(session)
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0)

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Strength Session</h1>
          <p className="text-sm text-text-muted-strong mt-0.5">
            {formatSessionDateTime(session.date)}
            {' · '}{totalSets} set{totalSets !== 1 ? 's' : ''}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={copyStatus !== 'idle'}
              className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-bg disabled:opacity-50"
            >
              {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-bg"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm('Delete this session?')) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-error-text border border-error/40 rounded-lg hover:bg-error/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <EditForm
          session={session}
          exercises={exercises}
          onSave={(data) => updateMutation.mutate(data)}
          onCancel={() => setEditing(false)}
          isPending={updateMutation.isPending}
        />
      ) : (
        <div className="space-y-4">
          {(session.title || session.duration_seconds != null || session.calories != null) && (
            <div className="bg-surface rounded-xl border border-border p-4 space-y-1">
              {session.title && (
                <p className="text-base font-semibold text-text">{session.title}</p>
              )}
              {session.duration_seconds != null && (
                <p className="text-sm text-text-muted-strong">Duration: {Math.round(session.duration_seconds / 60)} mins</p>
              )}
              {session.calories != null && (
                <p className="text-sm text-text-muted-strong">Calories: {session.calories} kcal</p>
              )}
            </div>
          )}
          {(session.wellbeing != null || session.rpe != null) && (
            <div className="bg-surface rounded-xl border border-border p-4">
              <EmojiRatingDisplay wellbeing={session.wellbeing} rpe={session.rpe} />
            </div>
          )}
          {session.notes && (
            <div className="bg-surface rounded-xl border border-border p-4">
              <p className="text-sm text-text">{session.notes}</p>
            </div>
          )}

          {session.exercises.map((entry) => (
            <div key={entry.id} className="bg-surface rounded-xl border border-border p-4">
              <h3 className="font-medium text-text mb-3">{entry.exercise_name}</h3>

              <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 mb-2 px-1">
                <span className="text-xs text-text-muted-strong">#</span>
                <span className="text-xs font-medium text-text-muted-strong">Reps</span>
                <span className="text-xs font-medium text-text-muted-strong">Weight</span>
                <span className="text-xs font-medium text-text-muted-strong">Notes</span>
              </div>

              <div className="space-y-1">
                {entry.sets.map((s) => (
                  <div key={s.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 items-center py-1 border-t border-border">
                    <span className="text-xs text-text-muted-strong text-center">{s.set_number}</span>
                    <span className="text-sm text-text">{s.reps ?? '—'}</span>
                    <span className="text-sm text-text">{s.weight != null ? `${s.weight} kg` : '—'}</span>
                    <span className="text-sm text-text-muted-strong overflow-hidden truncate">{s.notes ?? ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
