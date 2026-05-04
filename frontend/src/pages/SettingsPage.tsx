import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

interface CardioType {
  id: number
  name: string
  created_at: string
}

interface CardioTypeFormValues {
  name: string
}

interface ExerciseType {
  id: number
  name: string
  created_at: string
}

interface ExerciseTypeFormValues {
  name: string
}

interface Exercise {
  id: number
  name: string
  notes: string | null
  types: ExerciseType[]
  created_at: string
}

interface ExerciseFormValues {
  name: string
  notes: string
  type_ids: number[]
}

// ── Activity Types section ─────────────────────────────────────────────────

function ActivityTypesSection() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string }) => api.post<CardioType>('/cardio-types', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cardio-types'] })
      setEditingId(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch<CardioType>(`/cardio-types/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cardio-types'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/cardio-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cardio-types'] }),
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Activity Types</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + Add
          </button>
        )}
      </div>

      {editingId === 'new' && (
        <CardioTypeForm
          onSubmit={({ name }) => createMutation.mutate({ name })}
          onCancel={() => setEditingId(null)}
          isPending={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : types.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-gray-400">No activity types yet. Add types like "Run", "Cycling", "Swim".</p>
      ) : (
        <ul className="space-y-2">
          {types.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <CardioTypeForm
                  defaultValues={{ name: t.name }}
                  onSubmit={({ name }) => updateMutation.mutate({ id: t.id, name })}
                  onCancel={() => setEditingId(null)}
                  isPending={updateMutation.isPending}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between"
              >
                <span className="font-medium text-gray-900">{t.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function CardioTypeForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues?: CardioTypeFormValues
  onSubmit: (values: CardioTypeFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<CardioTypeFormValues>({
    defaultValues: defaultValues ?? { name: '' },
  })

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-xl border border-blue-200 p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Activity type name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Exercise Types section ─────────────────────────────────────────────────

function ExerciseTypesSection() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['exercise-types'],
    queryFn: () => api.get<ExerciseType[]>('/exercise-types'),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string }) => api.post<ExerciseType>('/exercise-types', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercise-types'] })
      qc.invalidateQueries({ queryKey: ['exercises'] })
      setEditingId(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch<ExerciseType>(`/exercise-types/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercise-types'] })
      qc.invalidateQueries({ queryKey: ['exercises'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/exercise-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercise-types'] })
      qc.invalidateQueries({ queryKey: ['exercises'] })
    },
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Exercise Types</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + Add
          </button>
        )}
      </div>

      {editingId === 'new' && (
        <ExerciseTypeForm
          onSubmit={({ name }) => createMutation.mutate({ name })}
          onCancel={() => setEditingId(null)}
          isPending={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : types.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-gray-400">No exercise types yet. Add types like "Push", "Pull", "Legs".</p>
      ) : (
        <ul className="space-y-2">
          {types.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <ExerciseTypeForm
                  defaultValues={{ name: t.name }}
                  onSubmit={({ name }) => updateMutation.mutate({ id: t.id, name })}
                  onCancel={() => setEditingId(null)}
                  isPending={updateMutation.isPending}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between"
              >
                <span className="font-medium text-gray-900">{t.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function ExerciseTypeForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  defaultValues?: ExerciseTypeFormValues
  onSubmit: (values: ExerciseTypeFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<ExerciseTypeFormValues>({
    defaultValues: defaultValues ?? { name: '' },
  })

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-xl border border-blue-200 p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Exercise type name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Exercises section ──────────────────────────────────────────────────────

function ExercisesSection() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  })

  const { data: allTypes = [] } = useQuery({
    queryKey: ['exercise-types'],
    queryFn: () => api.get<ExerciseType[]>('/exercise-types'),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; notes?: string; type_ids: number[] }) =>
      api.post<Exercise>('/exercises', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] })
      setEditingId(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; notes?: string; type_ids?: number[] }) =>
      api.patch<Exercise>(`/exercises/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/exercises/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Exercises</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + Add
          </button>
        )}
      </div>

      {editingId === 'new' && (
        <ExerciseForm
          allTypes={allTypes}
          onSubmit={(values) =>
            createMutation.mutate({ name: values.name, notes: values.notes || undefined, type_ids: values.type_ids })
          }
          onCancel={() => setEditingId(null)}
          isPending={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : exercises.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-gray-400">No exercises yet. Add your first one.</p>
      ) : (
        <ul className="space-y-2">
          {exercises.map((ex) =>
            editingId === ex.id ? (
              <li key={ex.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <ExerciseForm
                  allTypes={allTypes}
                  defaultValues={{ name: ex.name, notes: ex.notes ?? '', type_ids: ex.types.map((t) => t.id) }}
                  onSubmit={(values) =>
                    updateMutation.mutate({
                      id: ex.id,
                      name: values.name,
                      notes: values.notes || undefined,
                      type_ids: values.type_ids,
                    })
                  }
                  onCancel={() => setEditingId(null)}
                  isPending={updateMutation.isPending}
                />
              </li>
            ) : (
              <li
                key={ex.id}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{ex.name}</p>
                  {ex.notes && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{ex.notes}</p>
                  )}
                  {ex.types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ex.types.map((t) => (
                        <span
                          key={t.id}
                          className="inline-block bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingId(ex.id)}
                    className="text-sm text-gray-500 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ex.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function ExerciseForm({
  allTypes,
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  allTypes: ExerciseType[]
  defaultValues?: ExerciseFormValues
  onSubmit: (values: ExerciseFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ExerciseFormValues>({
    defaultValues: defaultValues ?? { name: '', notes: '', type_ids: [] },
  })

  const selectedTypeIds = watch('type_ids') ?? []

  function toggleType(id: number) {
    const current = selectedTypeIds
    if (current.includes(id)) {
      setValue('type_ids', current.filter((x) => x !== id))
    } else {
      setValue('type_ids', [...current, id])
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-xl border border-blue-200 p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Exercise name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <textarea
          placeholder="Notes (optional)"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          {...register('notes')}
        />
      </div>
      {allTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Types</p>
          <div className="flex flex-wrap gap-1.5">
            {allTypes.map((t) => {
              const selected = selectedTypeIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>
      <div className="space-y-10">
        <ActivityTypesSection />
        <ExerciseTypesSection />
        <ExercisesSection />
      </div>
    </Layout>
  )
}
