import { useEffect, useRef, useState } from 'react'
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

interface ExerciseRef {
  id: number
  name: string
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
        <h2 className="text-lg font-semibold text-text">Activity Types</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-primary-dark hover:brightness-95 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
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
        <p className="text-sm text-text-muted-strong">Loading…</p>
      ) : types.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-text-muted-strong">No activity types yet. Add types like "Run", "Cycling", "Swim".</p>
      ) : (
        <ul className="space-y-2">
          {types.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="bg-surface rounded-xl border border-border p-4">
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
                className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center justify-between"
              >
                <span className="font-medium text-text">{t.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="text-sm text-text-muted-strong"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text disabled:opacity-50"
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
      className="bg-surface rounded-xl border border-primary-light p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Activity type name"
          className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-error-text">{errors.name.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong px-3 py-1.5">
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
        <h2 className="text-lg font-semibold text-text">Exercise Types</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-primary-dark hover:brightness-95 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
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
        <p className="text-sm text-text-muted-strong">Loading…</p>
      ) : types.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-text-muted-strong">No exercise types yet. Add types like "Push", "Pull", "Legs".</p>
      ) : (
        <ul className="space-y-2">
          {types.map((t) =>
            editingId === t.id ? (
              <li key={t.id} className="bg-surface rounded-xl border border-border p-4">
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
                className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center justify-between"
              >
                <span className="font-medium text-text">{t.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="text-sm text-text-muted-strong"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text disabled:opacity-50"
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
      className="bg-surface rounded-xl border border-primary-light p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Exercise type name"
          className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-error-text">{errors.name.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong px-3 py-1.5">
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
  const [autoOpenPicker, setAutoOpenPicker] = useState(false)

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

  function handleCreate(values: ExerciseFormValues) {
    createMutation.mutate(
      { name: values.name, notes: values.notes || undefined, type_ids: values.type_ids },
      { onSuccess: () => { qc.invalidateQueries({ queryKey: ['exercises'] }); setEditingId(null) } }
    )
  }

  function handleCreateAndAddReplacement(values: ExerciseFormValues) {
    createMutation.mutate(
      { name: values.name, notes: values.notes || undefined, type_ids: values.type_ids },
      {
        onSuccess: (created) => {
          qc.setQueryData<Exercise[]>(['exercises'], (old = []) => [...old, created])
          setAutoOpenPicker(true)
          setEditingId(created.id)
          qc.invalidateQueries({ queryKey: ['exercises'] })
        },
      }
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-text">Exercises</h2>
        {editingId !== 'new' && (
          <button
            onClick={() => setEditingId('new')}
            className="bg-primary-dark hover:brightness-95 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + Add
          </button>
        )}
      </div>

      {editingId === 'new' && (
        <ExerciseForm
          allTypes={allTypes}
          onSubmit={handleCreate}
          onSaveAndAddReplacement={handleCreateAndAddReplacement}
          onCancel={() => setEditingId(null)}
          isPending={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-text-muted-strong">Loading…</p>
      ) : exercises.length === 0 && editingId !== 'new' ? (
        <p className="text-sm text-text-muted-strong">No exercises yet. Add your first one.</p>
      ) : (
        <ul className="space-y-2">
          {exercises.map((ex) =>
            editingId === ex.id ? (
              <li key={ex.id} className="bg-surface rounded-xl border border-border p-4">
                <ExerciseForm
                  exerciseId={ex.id}
                  allTypes={allTypes}
                  allExercises={exercises}
                  defaultValues={{ name: ex.name, notes: ex.notes ?? '', type_ids: ex.types.map((t) => t.id) }}
                  onSubmit={(values) =>
                    updateMutation.mutate({
                      id: ex.id,
                      name: values.name,
                      notes: values.notes || undefined,
                      type_ids: values.type_ids,
                    })
                  }
                  onCancel={() => { setAutoOpenPicker(false); setEditingId(null) }}
                  isPending={updateMutation.isPending}
                  autoOpenPicker={autoOpenPicker}
                  onPickerOpened={() => setAutoOpenPicker(false)}
                />
              </li>
            ) : (
              <li
                key={ex.id}
                className="bg-surface rounded-xl border border-border px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text truncate">{ex.name}</p>
                  {ex.notes && (
                    <p className="text-sm text-text-muted-strong mt-0.5 line-clamp-2">{ex.notes}</p>
                  )}
                  {ex.types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ex.types.map((t) => (
                        <span
                          key={t.id}
                          className="inline-block bg-primary-tint text-primary-dark text-xs font-medium px-2 py-0.5 rounded-full"
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
                    className="text-sm text-text-muted-strong"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ex.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text disabled:opacity-50"
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



// ── Replacement helpers ────────────────────────────────────────────────────

function groupExercises(exercises: Exercise[]): { label: string; items: Exercise[] }[] {
  const map = new Map<string, Exercise[]>()
  for (const ex of exercises) {
    const tags = ex.types && ex.types.length > 0 ? ex.types : null
    if (!tags) {
      const bucket = map.get('Other') ?? []
      bucket.push(ex)
      map.set('Other', bucket)
    } else {
      for (const tag of tags) {
        const bucket = map.get(tag.name) ?? []
        bucket.push(ex)
        map.set(tag.name, bucket)
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })
    .map(([label, items]) => ({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
}

function ReplacementPicker({
  allExercises,
  excludeIds,
  onSelect,
  onClose,
}: {
  allExercises: Exercise[]
  excludeIds: Set<number>
  onSelect: (ex: ExerciseRef) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const candidates = allExercises.filter((ex) => !excludeIds.has(ex.id))
  const filtered = search.trim()
    ? candidates.filter((ex) => ex.name.toLowerCase().includes(search.toLowerCase()))
    : candidates
  const groups = groupExercises(filtered)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-text/40" onClick={onClose} />
      <div className="relative bg-surface pb-[env(safe-area-inset-bottom)] sm:pb-0 rounded-t-[20px] sm:rounded-xl w-full sm:max-w-md shadow-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <h2 className="font-semibold text-text">Add replacement</h2>
          <button type="button" onClick={onClose} className="text-text-muted text-xl leading-none" aria-label="Close">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {groups.length === 0 ? (
            <p className="text-sm text-text-muted-strong text-center py-6">No exercises found.</p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-text-muted-strong uppercase tracking-wide">{group.label}</p>
                {group.items.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => onSelect({ id: ex.id, name: ex.name })}
                    className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-primary-tint hover:text-primary-dark"
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ReplacementsSection({
  exerciseId,
  allExercises,
  autoOpenPicker,
  onPickerOpened,
}: {
  exerciseId: number
  allExercises: Exercise[]
  autoOpenPicker?: boolean
  onPickerOpened?: () => void
}) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (autoOpenPicker) {
      setPickerOpen(true)
      onPickerOpened?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [reverseCandidate, setReverseCandidate] = useState<ExerciseRef | null>(null)

  const { data: replacements = [] } = useQuery({
    queryKey: ['replacements', exerciseId],
    queryFn: () => api.get<ExerciseRef[]>(`/exercises/${exerciseId}/replacements`),
  })

  const addMutation = useMutation({
    mutationFn: (replacementId: number) =>
      api.post<ExerciseRef[]>(`/exercises/${exerciseId}/replacements`, { replacement_id: replacementId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['replacements', exerciseId] }),
  })

  const addReverseMutation = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.post<ExerciseRef[]>(`/exercises/${sourceId}/replacements`, { replacement_id: targetId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['replacements', vars.sourceId] })
      setReverseCandidate(null)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (replacementId: number) =>
      api.delete<ExerciseRef[]>(`/exercises/${exerciseId}/replacements/${replacementId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['replacements', exerciseId] }),
  })

  function handleSelect(selected: ExerciseRef) {
    setPickerOpen(false)
    addMutation.mutate(selected.id, { onSuccess: () => setReverseCandidate(selected) })
  }

  const replacementIds = new Set(replacements.map((r) => r.id))

  return (
    <div className="border-t border-border pt-3">
      <p className="text-sm font-medium text-text mb-2">Replacements</p>
      {replacements.length === 0 ? (
        <p className="text-xs text-text-muted-strong mb-2">No replacements configured.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {replacements.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-text">{r.name}</span>
              <button
                type="button"
                onClick={() => removeMutation.mutate(r.id)}
                disabled={removeMutation.isPending}
                className="text-text-muted-strong hover:text-error-text disabled:opacity-40 text-base leading-none px-1"
                aria-label={`Remove ${r.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {reverseCandidate && (
        <div className="bg-primary-tint border border-primary-light rounded-lg px-3 py-2 mb-2 text-sm">
          <p className="text-primary-dark mb-1.5">
            Also add <strong>{allExercises.find((e) => e.id === exerciseId)?.name}</strong> as a replacement for <strong>{reverseCandidate.name}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addReverseMutation.mutate({ sourceId: reverseCandidate.id, targetId: exerciseId })}
              disabled={addReverseMutation.isPending}
              className="text-xs bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-medium"
            >
              {addReverseMutation.isPending ? 'Adding…' : 'Yes, add reverse'}
            </button>
            <button type="button" onClick={() => setReverseCandidate(null)} className="text-xs text-primary-dark px-2 py-1">
              Skip
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setPickerOpen(true)} className="text-xs text-primary-dark font-medium">
        + Add replacement
      </button>
      {pickerOpen && (
        <ReplacementPicker
          allExercises={allExercises}
          excludeIds={new Set([exerciseId, ...replacementIds])}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ── Exercise form ──────────────────────────────────────────────────────────

function ExerciseForm({
  exerciseId,
  allTypes,
  allExercises,
  defaultValues,
  onSubmit,
  onSaveAndAddReplacement,
  onCancel,
  isPending,
  autoOpenPicker,
  onPickerOpened,
}: {
  exerciseId?: number
  allTypes: ExerciseType[]
  allExercises?: Exercise[]
  defaultValues?: ExerciseFormValues
  onSubmit: (values: ExerciseFormValues) => void
  onSaveAndAddReplacement?: (values: ExerciseFormValues) => void
  onCancel: () => void
  isPending: boolean
  autoOpenPicker?: boolean
  onPickerOpened?: () => void
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
      className="bg-surface rounded-xl border border-primary-light p-4 space-y-3"
    >
      <div>
        <input
          type="text"
          placeholder="Exercise name"
          className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...register('name', { required: 'Name is required' })}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-error-text">{errors.name.message}</p>
        )}
      </div>
      <div>
        <textarea
          placeholder="Notes (optional)"
          rows={2}
          className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          {...register('notes')}
        />
      </div>
      {allTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted-strong mb-1.5">Types</p>
          <div className="flex flex-wrap gap-1.5">
            {allTypes.map((t) => {
              const selected = selectedTypeIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-sm border transition-colors ${
                    selected
                      ? 'bg-primary-dark text-white border-primary-dark'
                      : 'bg-surface text-text-muted-strong border-border hover:border-primary'
                  }`}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {exerciseId !== undefined && allExercises !== undefined && (
        <ReplacementsSection
          exerciseId={exerciseId}
          allExercises={allExercises}
          autoOpenPicker={autoOpenPicker}
          onPickerOpened={onPickerOpened}
        />
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {onSaveAndAddReplacement && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleSubmit(onSaveAndAddReplacement)}
            className="bg-surface hover:bg-bg disabled:opacity-50 text-primary-dark text-sm font-medium px-4 py-1.5 rounded-lg border border-primary-light"
          >
            {isPending ? 'Saving…' : 'Save & add replacement'}
          </button>
        )}
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong px-3 py-1.5">
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
      <h1 className="text-2xl font-bold text-text mb-6">Settings</h1>
      <div className="space-y-10">
        <ActivityTypesSection />
        <ExerciseTypesSection />
  <ExercisesSection />
      </div>
    </Layout>
  )
}
