import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Layout } from '../components/Layout'
import {
  ExerciseEntryBlock,
  type ExerciseEntryFormValues,
  type ExerciseOption,
} from '../components/ExerciseEntryBlock'
import { emptyEntry } from '../components/exerciseEntryDefaults'
import { api } from '../lib/api'
import { findInvalidSetDuration, setAmounts } from '../lib/strengthSession'

// ── API types ─────────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: number
  name: string
  exercise_count: number
}

interface TemplateSet {
  id: number
  set_number: number
  reps: number | null
  weight_kg: number | null
  duration_seconds?: number | null
}

interface TemplateExercise {
  id: number
  exercise_id: number
  exercise_name: string
  order: number
  sets: TemplateSet[]
}

interface TemplateDetail {
  id: number
  name: string
  exercises: TemplateExercise[]
}

// ── Form types ────────────────────────────────────────────────────────────────

interface TemplateFormValues {
  name: string
  exercises: ExerciseEntryFormValues[]
}

function detailToFormValues(t: TemplateDetail): TemplateFormValues {
  return {
    name: t.name,
    exercises: t.exercises.map((entry) => ({
      exercise_id: String(entry.exercise_id),
      sets: entry.sets.map((s) => ({
        reps: s.reps != null ? String(s.reps) : '',
        duration: s.duration_seconds != null ? String(s.duration_seconds) : '',
        weight: s.weight_kg != null ? String(s.weight_kg) : '',
        notes: '',
        rpe: '',
        done: false,
      })),
    })),
  }
}

function toApiPayload(data: TemplateFormValues) {
  return {
    name: data.name,
    exercises: data.exercises.map((entry, i) => ({
      exercise_id: parseInt(entry.exercise_id, 10),
      order: i + 1,
      // Reps or a duration, never both: only the value the set holds is sent
      sets: entry.sets.map((s, si) => ({
        set_number: si + 1,
        ...setAmounts(s),
        weight_kg: s.weight ? parseFloat(s.weight) : null,
      })),
    })),
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PageMode = 'list' | 'new' | { editId: number }

export default function TemplatesPage() {
  const [mode, setMode] = useState<PageMode>('list')

  if (mode === 'list') {
    return <TemplateList onNew={() => setMode('new')} onEdit={(id) => setMode({ editId: id })} />
  }

  if (mode === 'new') {
    return <TemplateFormPage onDone={() => setMode('list')} />
  }

  return <TemplateFormPage editId={(mode as { editId: number }).editId} onDone={() => setMode('list')} />
}

// ── Template list ─────────────────────────────────────────────────────────────

function TemplateList({
  onNew,
  onEdit,
}: {
  onNew: () => void
  onEdit: (id: number) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates', 'strength'],
    queryFn: () => api.get<TemplateSummary[]>('/templates/strength'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/templates/strength/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
      setDeleteConfirmId(null)
    },
  })

  if (isLoading) {
    return (
      <Layout>
        <p className="text-text-muted-strong text-sm">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-text">Templates</h1>
        <button
          onClick={onNew}
          className="bg-primary-dark hover:brightness-95 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-text-muted-strong text-sm">No templates yet. Create your first one.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="bg-surface rounded-xl border border-border px-4 py-3"
            >
              {deleteConfirmId === t.id ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-text">
                    Delete <span className="font-medium">{t.name}</span>?
                  </p>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                      className="text-sm text-error-text hover:underline font-medium disabled:opacity-50 min-h-11 px-2"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-sm text-text-muted-strong hover:text-text min-h-11 px-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text truncate">{t.name}</p>
                    <p className="text-sm text-text-muted-strong mt-0.5">
                      {t.exercise_count} {t.exercise_count === 1 ? 'exercise' : 'exercises'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => navigate(`/log?templateId=${t.id}`)}
                      className="text-sm text-primary-dark hover:underline font-medium min-h-11 px-3"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => onEdit(t.id)}
                      className="text-sm text-text-muted-strong hover:text-text min-h-11 px-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(t.id)}
                      aria-label={`Delete template ${t.name}`}
                      title="Delete"
                      className="flex items-center justify-center min-h-11 min-w-11 text-error hover:text-error-text"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
}

// ── Template form page ────────────────────────────────────────────────────────

function TemplateFormPage({
  editId,
  onDone,
}: {
  editId?: number
  onDone: () => void
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<ExerciseOption[]>('/exercises'),
  })

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['templates', 'strength', editId],
    queryFn: () => api.get<TemplateDetail>(`/templates/strength/${editId}`),
    enabled: editId !== undefined,
  })

  if (editId !== undefined && loadingExisting) {
    return (
      <Layout>
        <p className="text-text-muted-strong text-sm">Loading…</p>
      </Layout>
    )
  }

  const defaultValues: TemplateFormValues = existing
    ? detailToFormValues(existing)
    : { name: '', exercises: [emptyEntry()] }

  return (
    <TemplateForm
      title={editId !== undefined ? 'Edit Template' : 'New Template'}
      defaultValues={defaultValues}
      editId={editId}
      exercises={exercises}
      onDone={onDone}
    />
  )
}

// ── Template form ─────────────────────────────────────────────────────────────

function TemplateForm({
  title,
  defaultValues,
  editId,
  exercises,
  onDone,
}: {
  title: string
  defaultValues: TemplateFormValues
  editId?: number
  exercises: ExerciseOption[]
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [collapsedExercises, setCollapsedExercises] = useState<Set<number>>(new Set())

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<TemplateFormValues>({ defaultValues })

  const {
    fields: exerciseFields,
    append: appendExercise,
    remove: removeExercise,
  } = useFieldArray({ control, name: 'exercises' })

  const createMutation = useMutation({
    mutationFn: (data: TemplateFormValues) =>
      api.post<TemplateDetail>('/templates/strength', toApiPayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
      onDone()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: TemplateFormValues) =>
      api.patch<TemplateDetail>(`/templates/strength/${editId}`, toApiPayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
      onDone()
    },
  })

  const mutation = editId !== undefined ? updateMutation : createMutation
  // A time like "0" or "1:3" would be saved as an empty set: refuse it, naming the set. After a refused
  // save the message follows the live values, so it clears once fixed
  const [showSetError, setShowSetError] = useState(false)
  const watchedExercises = useWatch({ control, name: 'exercises' })
  const names = new Map(exercises.map((e) => [String(e.id), e.name]))
  const invalidSet = (list: ExerciseEntryFormValues[] | undefined) => findInvalidSetDuration(list, (id) => names.get(id))
  const setError = showSetError ? (invalidSet(watchedExercises)?.message ?? null) : null
  const onSubmit = (data: TemplateFormValues) => {
    const ok = invalidSet(data.exercises) === null
    setShowSetError(!ok)
    if (ok) mutation.mutate(data)
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">Name *</label>
            <input
              type="text"
              placeholder="e.g. Push Day"
              className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
              autoFocus
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && <p className="mt-1 text-xs text-error-text">{errors.name.message}</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-text">Exercises</h2>
          </div>
          <div className="space-y-4">
            {exerciseFields.map((exField, exIndex) => (
              <ExerciseEntryBlock
                key={exField.id}
                exIndex={exIndex}
                register={register}
                control={control}
                exercises={exercises}
                showNotes={false}
                canRemove={exerciseFields.length > 1}
                onRemove={() => {
                  removeExercise(exIndex)
                  setCollapsedExercises((prev) => {
                    const next = new Set<number>()
                    for (const idx of prev) {
                      if (idx < exIndex) next.add(idx)
                      else if (idx > exIndex) next.add(idx - 1)
                    }
                    return next
                  })
                }}
                errors={errors}
                isCollapsed={collapsedExercises.has(exIndex)}
                onToggleCollapse={() =>
                  setCollapsedExercises((prev) => {
                    const next = new Set(prev)
                    if (next.has(exIndex)) next.delete(exIndex)
                    else next.add(exIndex)
                    return next
                  })
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => appendExercise(emptyEntry())}
            className="mt-3 text-sm text-primary-dark hover:underline font-medium"
          >
            + Add Exercise
          </button>
        </div>

        {setError && (
          <p role="alert" className="text-sm text-error-text">
            {setError}
          </p>
        )}
        {mutation.isError && !setError && (
          <p className="text-sm text-error-text">Failed to save template. Please try again.</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 bg-primary-dark text-white py-2.5 rounded-xl text-sm font-medium hover:brightness-95 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save Template'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-text hover:bg-bg"
          >
            Cancel
          </button>
        </div>
      </form>
    </Layout>
  )
}
