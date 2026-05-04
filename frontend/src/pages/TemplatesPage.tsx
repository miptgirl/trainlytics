import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import {
  emptyEntry,
  ExerciseEntryBlock,
  type ExerciseEntryFormValues,
  type ExerciseOption,
} from '../components/ExerciseEntryBlock'
import { api } from '../lib/api'

// ── API types ─────────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: number
  name: string
  notes: string | null
  exercise_count: number
}

interface TemplateSet {
  id: number
  set_number: number
  reps: number | null
  weight_kg: number | null
  notes: string | null
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
  notes: string | null
  exercises: TemplateExercise[]
}

// ── Form types ────────────────────────────────────────────────────────────────

interface TemplateFormValues {
  name: string
  notes: string
  exercises: ExerciseEntryFormValues[]
}

function detailToFormValues(t: TemplateDetail): TemplateFormValues {
  return {
    name: t.name,
    notes: t.notes ?? '',
    exercises: t.exercises.map((entry) => ({
      exercise_id: String(entry.exercise_id),
      sets: entry.sets.map((s) => ({
        reps: s.reps != null ? String(s.reps) : '',
        weight: s.weight_kg != null ? String(s.weight_kg) : '',
        notes: s.notes ?? '',
        done: false,
      })),
    })),
  }
}

function toApiPayload(data: TemplateFormValues) {
  return {
    name: data.name,
    notes: data.notes || null,
    exercises: data.exercises.map((entry, i) => ({
      exercise_id: parseInt(entry.exercise_id, 10),
      order: i + 1,
      sets: entry.sets.map((s, si) => ({
        set_number: si + 1,
        reps: s.reps ? parseInt(s.reps, 10) : null,
        weight_kg: s.weight ? parseFloat(s.weight) : null,
        notes: s.notes || null,
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
        <p className="text-gray-400 text-sm">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Templates</h1>
        <button
          onClick={onNew}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-gray-400 text-sm">No templates yet. Create your first one.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3"
            >
              {deleteConfirmId === t.id ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-700">
                    Delete <span className="font-medium">{t.name}</span>?
                  </p>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                      className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-sm text-gray-500 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {t.exercise_count} {t.exercise_count === 1 ? 'exercise' : 'exercises'}
                    </p>
                    {t.notes && (
                      <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{t.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => navigate(`/log?templateId=${t.id}`)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => onEdit(t.id)}
                      className="text-sm text-gray-500 hover:text-gray-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(t.id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Delete
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
        <p className="text-gray-400 text-sm">Loading…</p>
      </Layout>
    )
  }

  const defaultValues: TemplateFormValues = existing
    ? detailToFormValues(existing)
    : { name: '', notes: '', exercises: [emptyEntry()] }

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
  const onSubmit = (data: TemplateFormValues) => mutation.mutate(data)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              placeholder="e.g. Push Day"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              {...register('name', { required: 'Name is required' })}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Exercises</h2>
          </div>
          <div className="space-y-4">
            {exerciseFields.map((exField, exIndex) => (
              <ExerciseEntryBlock
                key={exField.id}
                exIndex={exIndex}
                register={register}
                control={control}
                exercises={exercises}
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
            className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Exercise
          </button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">Failed to save template. Please try again.</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save Template'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Layout>
  )
}
