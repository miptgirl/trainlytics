import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { datetimeLocalToUTC, formatSessionDateTime, toDatetimeLocal } from '../lib/dateUtils'

interface Exercise {
  id: number
  name: string
}

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
  created_at: string
  exercises: StrengthExerciseEntry[]
}

// ── Edit form types ──────────────────────────────────────────────────────────

interface SetFormValues {
  reps: string
  weight: string
  notes: string
}

interface ExerciseEntryFormValues {
  exercise_id: string
  sets: SetFormValues[]
}

interface EditFormValues {
  title: string
  duration_minutes: string
  calories: string
  date: string
  notes: string
  exercises: ExerciseEntryFormValues[]
}

const emptySet = (): SetFormValues => ({ reps: '', weight: '', notes: '' })
const emptyEntry = (): ExerciseEntryFormValues => ({ exercise_id: '', sets: [emptySet()] })

function toForm(session: StrengthSession): EditFormValues {
  return {
    title: session.title ?? '',
    duration_minutes: session.duration_seconds != null ? String(Math.round(session.duration_seconds / 60)) : '',
    calories: session.calories?.toString() ?? '',
    date: toDatetimeLocal(session.date),
    notes: session.notes ?? '',
    exercises: session.exercises.map((entry) => ({
      exercise_id: entry.exercise_id.toString(),
      sets: entry.sets.map((s) => ({
        reps: s.reps?.toString() ?? '',
        weight: s.weight?.toString() ?? '',
        notes: s.notes ?? '',
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
  exercises: Exercise[]
  onSave: (data: EditFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<EditFormValues>({
    defaultValues: toForm(session),
  })
  const { fields: exFields, append: appendEx, remove: removeEx } = useFieldArray({
    control,
    name: 'exercises',
  })

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('date', { required: 'Date is required' })}
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            {...register('notes')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (mins)</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Optional, e.g. 60"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('duration_minutes')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal, optional)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 500"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('calories')}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Exercises</h2>
          <button
            type="button"
            onClick={() => appendEx(emptyEntry())}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Exercise
          </button>
        </div>
        <div className="space-y-4">
          {exFields.map((exField, exIndex) => (
            <EditExerciseBlock
              key={exField.id}
              exIndex={exIndex}
              register={register}
              control={control}
              exercises={exercises}
              canRemove={exFields.length > 1}
              onRemove={() => removeEx(exIndex)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditExerciseBlock({
  exIndex,
  register,
  control,
  exercises,
  canRemove,
  onRemove,
}: {
  exIndex: number
  register: any
  control: any
  exercises: Exercise[]
  canRemove: boolean
  onRemove: () => void
}) {
  const { fields: setFields, append: appendSet, remove: removeSet } = useFieldArray({
    control,
    name: `exercises.${exIndex}.sets`,
  })
  const selectedId = useWatch({ control, name: `exercises.${exIndex}.exercise_id` })
  const selectedExercise = exercises.find((e) => e.id === parseInt(selectedId, 10))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">
          Exercise {exIndex + 1}{selectedExercise ? ` — ${selectedExercise.name}` : ''}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">
            Remove exercise
          </button>
        )}
      </div>
      <div className="mb-4">
        <select
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register(`exercises.${exIndex}.exercise_id`, { required: 'Select an exercise' })}
        >
          <option value="">— select exercise —</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 mb-1 px-1">
        <span className="text-xs text-gray-400">#</span>
        <span className="text-xs text-gray-500">Reps</span>
        <span className="text-xs text-gray-500">Weight (kg)</span>
        <span className="text-xs text-gray-500">Notes</span>
        <span />
      </div>
      <div className="space-y-2">
        {setFields.map((setField, setIndex) => (
          <div key={setField.id} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 items-center">
            <span className="text-xs text-gray-400 text-center">{setIndex + 1}</span>
            <input type="number" min="0" placeholder="reps"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              {...register(`exercises.${exIndex}.sets.${setIndex}.reps`)} />
            <input type="number" min="0" step="any" placeholder="kg"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              {...register(`exercises.${exIndex}.sets.${setIndex}.weight`)} />
            <input type="text" placeholder="notes"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              {...register(`exercises.${exIndex}.sets.${setIndex}.notes`)} />
            {setFields.length > 1 ? (
              <button type="button" onClick={() => removeSet(setIndex)}
                className="text-gray-400 hover:text-red-500 text-sm" aria-label="Remove set">✕</button>
            ) : <span />}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => appendSet(emptySet())}
        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
        + Add Set
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StrengthSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => api.get<StrengthSession>(`/sessions/${id}`),
  })

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<Exercise[]>('/exercises'),
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
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/')
    },
  })

  if (isLoading) {
    return (
      <Layout>
        <p className="text-gray-500 text-sm">Loading…</p>
      </Layout>
    )
  }

  if (isError || !session) {
    return (
      <Layout>
        <p className="text-red-600 text-sm">Session not found.</p>
      </Layout>
    )
  }

  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0)

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Strength Session</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatSessionDateTime(session.date)}
            {' · '}{totalSets} set{totalSets !== 1 ? 's' : ''}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm('Delete this session?')) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
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
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
              {session.title && (
                <p className="text-base font-semibold text-gray-900">{session.title}</p>
              )}
              {session.duration_seconds != null && (
                <p className="text-sm text-gray-500">Duration: {Math.round(session.duration_seconds / 60)} mins</p>
              )}
              {session.calories != null && (
                <p className="text-sm text-gray-500">Calories: {session.calories} kcal</p>
              )}
            </div>
          )}
          {session.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-700">{session.notes}</p>
            </div>
          )}

          {session.exercises.map((entry) => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">{entry.exercise_name}</h3>

              <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 mb-2 px-1">
                <span className="text-xs text-gray-400">#</span>
                <span className="text-xs font-medium text-gray-500">Reps</span>
                <span className="text-xs font-medium text-gray-500">Weight</span>
                <span className="text-xs font-medium text-gray-500">Notes</span>
              </div>

              <div className="space-y-1">
                {entry.sets.map((s) => (
                  <div key={s.id} className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center py-1 border-t border-gray-100">
                    <span className="text-xs text-gray-400 text-center">{s.set_number}</span>
                    <span className="text-sm text-gray-900">{s.reps ?? '—'}</span>
                    <span className="text-sm text-gray-900">{s.weight != null ? `${s.weight} kg` : '—'}</span>
                    <span className="text-sm text-gray-500">{s.notes ?? ''}</span>
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
