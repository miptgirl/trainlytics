import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useRestLength } from '../lib/hooks/useRestLength'
import {
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_LENGTHS,
  REST_STEP_SECONDS,
  formatClock,
  isValidRestLength,
  parseRestInput,
  restSaveErrorMessage,
  type WeightScale,
} from '../lib/workoutMode'

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
  weight_scale: WeightScale | null
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
  weightSteps: string
  topLb: string
  plateLb: string
  plates: string
}

// ── Workout section ────────────────────────────────────────────────────────

const REST_RANGE = `${MIN_REST_SECONDS}–${MAX_REST_SECONDS} seconds, in steps of ${REST_STEP_SECONDS}`

function WorkoutSection() {
  const { restLength, unsynced, saving, saveError, chooseRestLength, clearSaveError } = useRestLength()
  // Text being typed into the custom field; null shows the current length
  const [draft, setDraft] = useState<string | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  // "Saved" only confirms a pick made here
  const [picked, setPicked] = useState(false)
  const typed = draft ?? String(restLength)
  const typedSeconds = parseRestInput(typed)
  // One message under the field at a time: what's wrong with the input, else
  // why the last save failed, else the allowed range
  const problem = inputError ?? (saveError != null ? restSaveErrorMessage(saveError) : null)

  function choose(seconds: number) {
    setDraft(null)
    setInputError(null)
    setPicked(true)
    chooseRestLength(seconds)
  }

  function submitCustom(e: FormEvent) {
    e.preventDefault()
    if (!isValidRestLength(typedSeconds)) {
      clearSaveError()
      setInputError(`Enter ${REST_RANGE}.`)
      return
    }
    choose(typedSeconds)
  }

  return (
    <section aria-labelledby="settings-workout">
      <h2 id="settings-workout" className="text-lg font-semibold text-text mb-3">
        Workout
      </h2>
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <div>
          <h3 id="settings-rest-timer" className="font-medium text-text">
            Rest timer
          </h3>
          <p className="text-sm text-text-muted-strong">Counts down after each completed set in Workout Mode.</p>
        </div>
        <div role="group" aria-labelledby="settings-rest-timer" className="grid grid-cols-4 gap-2">
          {REST_LENGTHS.map((sec) => (
            <button
              key={sec}
              type="button"
              aria-pressed={restLength === sec}
              onClick={() => choose(sec)}
              className={`min-h-11 rounded-lg border text-sm font-medium ${
                restLength === sec
                  ? 'border-primary-dark bg-primary-tint text-primary-dark'
                  : 'border-border-strong bg-surface text-text'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
        <form onSubmit={submitCustom} noValidate className="space-y-1">
          <label htmlFor="rest-custom" className="block text-sm font-medium text-text">
            Custom length (seconds)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="rest-custom"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={typed}
              onChange={(e) => {
                setDraft(e.target.value)
                setInputError(null)
                clearSaveError()
              }}
              aria-invalid={inputError !== null}
              aria-describedby="rest-custom-message"
              className="w-24 min-h-11 border border-border-strong rounded-sm bg-surface px-3 text-base text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-dark"
            />
            <button
              type="submit"
              className="min-h-11 px-4 rounded-lg bg-primary-dark hover:brightness-95 text-white text-sm font-medium"
            >
              Save
            </button>
            {isValidRestLength(typedSeconds) && (
              <span className="text-sm text-text-muted-strong tabular-nums">{formatClock(typedSeconds)}</span>
            )}
          </div>
          {problem !== null ? (
            <p id="rest-custom-message" role="alert" className="text-sm text-error-text">
              {problem}
            </p>
          ) : (
            <p id="rest-custom-message" className="text-xs text-text-muted-strong">
              {REST_RANGE}.
            </p>
          )}
        </form>
        <p role="status" className={`text-sm empty:hidden ${saving ? 'text-text-muted-strong' : 'text-success-text'}`}>
          {saving ? 'Saving…' : picked && !unsynced && problem === null && draft === null ? 'Saved' : ''}
        </p>
      </div>
    </section>
  )
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
                    className="text-sm text-text-muted-strong hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text hover:underline disabled:opacity-50"
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
          className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
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
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong hover:text-text px-3 py-1.5">
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
                    className="text-sm text-text-muted-strong hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text hover:underline disabled:opacity-50"
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
          className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
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
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong hover:text-text px-3 py-1.5">
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
    mutationFn: (body: { name: string; notes?: string; type_ids: number[]; weight_scale: WeightScale | null }) =>
      api.post<Exercise>('/exercises', body),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; notes?: string | null; type_ids?: number[]; weight_scale: WeightScale | null }) =>
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
      {
        name: values.name,
        notes: values.notes || undefined,
        type_ids: values.type_ids,
        weight_scale: scaleFromForm(values),
      },
      { onSuccess: () => { qc.invalidateQueries({ queryKey: ['exercises'] }); setEditingId(null) } }
    )
  }

  function handleCreateAndAddReplacement(values: ExerciseFormValues) {
    createMutation.mutate(
      {
        name: values.name,
        notes: values.notes || undefined,
        type_ids: values.type_ids,
        weight_scale: scaleFromForm(values),
      },
      {
        onSuccess: (created) => {
          // The response carries weight_scale, so the cached row keeps the setting
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
                  defaultValues={{
                    name: ex.name,
                    notes: ex.notes ?? '',
                    type_ids: ex.types.map((t) => t.id),
                    ...weightStepFields(ex.weight_scale ?? null),
                  }}
                  onSubmit={(values) =>
                    updateMutation.mutate({
                      id: ex.id,
                      name: values.name,
                      // PATCH skips omitted fields, so an emptied field must send null to clear the notes
                      notes: values.notes || null,
                      type_ids: values.type_ids,
                      weight_scale: scaleFromForm(values),
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
                    className="text-sm text-text-muted-strong hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ex.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-error-text hover:underline disabled:opacity-50"
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
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none" aria-label="Close">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
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
            <button type="button" onClick={() => setReverseCandidate(null)} className="text-xs text-primary-dark hover:underline px-2 py-1">
              Skip
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setPickerOpen(true)} className="text-xs text-primary-dark hover:underline font-medium">
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

// ── Weight steps ───────────────────────────────────────────────────────────

/** The "Weight steps" choices: `value` is the select's value, `scale` what it saves. */
const WEIGHT_STEP_PRESETS: { value: string; label: string; scale: WeightScale | null }[] = [
  { value: 'default', label: 'Default (10 lb stack)', scale: null },
  { value: 'stack-10', label: 'Stack, 10 lb plates', scale: { kind: 'stack', top_lb: 10, plate_lb: 10, plates: null } },
  { value: 'stack-15', label: 'Stack, 15 lb plates', scale: { kind: 'stack', top_lb: 10, plate_lb: 15, plates: null } },
  { value: 'increment-2.5', label: 'Plates, ±2.5 kg', scale: { kind: 'increment', step_kg: 2.5 } },
]

/** Identity of a scale, to find the preset that equals a stored one. */
function scaleKey(scale: WeightScale): string {
  return scale.kind === 'stack'
    ? `stack ${scale.top_lb} ${scale.plate_lb} ${scale.plates ?? ''}`
    : `increment ${scale.step_kg}`
}

/** A plate weight in lb: 1 to 50 (the API's bounds). */
const isValidLb = (raw: string): boolean => raw.trim() !== '' && Number(raw) >= 1 && Number(raw) <= 50

/** Form fields for a stored setting: a matching preset, else custom stack fields, else its kg step. */
function weightStepFields(scale: WeightScale | null): Pick<ExerciseFormValues, 'weightSteps' | 'topLb' | 'plateLb' | 'plates'> {
  const blank = { topLb: '', plateLb: '', plates: '' }
  if (scale === null) return { weightSteps: 'default', ...blank }
  const preset = WEIGHT_STEP_PRESETS.find((p) => p.scale && scaleKey(p.scale) === scaleKey(scale))
  if (preset) return { weightSteps: preset.value, ...blank }
  if (scale.kind === 'stack') {
    return {
      weightSteps: 'custom',
      topLb: String(scale.top_lb),
      plateLb: String(scale.plate_lb),
      plates: scale.plates == null ? '' : String(scale.plates),
    }
  }
  return { weightSteps: `increment-${scale.step_kg}`, ...blank }
}

/** The setting a saved form describes. `increment-<kg>` without a preset is a kg step set through the API. */
function scaleFromForm(values: ExerciseFormValues): WeightScale | null {
  if (values.weightSteps === 'custom') {
    return {
      kind: 'stack',
      top_lb: Number(values.topLb),
      plate_lb: Number(values.plateLb),
      plates: values.plates.trim() === '' ? null : Number(values.plates),
    }
  }
  const preset = WEIGHT_STEP_PRESETS.find((p) => p.value === values.weightSteps)
  if (preset) return preset.scale
  return { kind: 'increment', step_kg: Number(values.weightSteps.slice('increment-'.length)) }
}

/**
 * The stored kg step, when it has no preset: it keeps its own option, so the
 * select still offers it after the user picks another choice.
 */
function storedIncrementOption(stored: ExerciseFormValues | undefined): string | null {
  const value = stored?.weightSteps
  if (!value?.startsWith('increment-') || WEIGHT_STEP_PRESETS.some((p) => p.value === value)) return null
  return value
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
    defaultValues: defaultValues ?? { name: '', notes: '', type_ids: [], ...weightStepFields(null) },
  })

  const selectedTypeIds = watch('type_ids') ?? []
  const weightSteps = watch('weightSteps')
  const storedStep = storedIncrementOption(defaultValues)
  const fieldClass = 'w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark'

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
          className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
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
          className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark resize-none"
          {...register('notes')}
        />
      </div>
      <div>
        <label htmlFor="exercise-weight-steps" className="block text-xs font-medium text-text-muted-strong mb-1">
          Weight steps
        </label>
        <select id="exercise-weight-steps" className={`${fieldClass} bg-surface`} {...register('weightSteps')}>
          {WEIGHT_STEP_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {storedStep && <option value={storedStep}>{`Plates, ±${storedStep.slice('increment-'.length)} kg`}</option>}
          <option value="custom">Custom stack</option>
        </select>
      </div>
      {weightSteps === 'custom' && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="exercise-top-lb" className="block text-xs font-medium text-text-muted-strong mb-1">
                Top plate (lb)
              </label>
              <input
                id="exercise-top-lb"
                type="number"
                inputMode="decimal"
                step="any"
                className={fieldClass}
                {...register('topLb', {
                  validate: (v, all) => all.weightSteps !== 'custom' || isValidLb(v) || 'Enter 1–50 lb',
                })}
              />
            </div>
            <div>
              <label htmlFor="exercise-plate-lb" className="block text-xs font-medium text-text-muted-strong mb-1">
                Plate (lb)
              </label>
              <input
                id="exercise-plate-lb"
                type="number"
                inputMode="decimal"
                step="any"
                className={fieldClass}
                {...register('plateLb', {
                  validate: (v, all) => all.weightSteps !== 'custom' || isValidLb(v) || 'Enter 1–50 lb',
                })}
              />
            </div>
            <div>
              <label htmlFor="exercise-plates" className="block text-xs font-medium text-text-muted-strong mb-1">
                Plates (optional)
              </label>
              <input
                id="exercise-plates"
                type="number"
                inputMode="numeric"
                step={1}
                className={fieldClass}
                {...register('plates', {
                  validate: (v, all) =>
                    all.weightSteps !== 'custom' ||
                    v.trim() === '' ||
                    (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100) ||
                    'Enter 1–100 or leave blank',
                })}
              />
            </div>
          </div>
          {errors.topLb && <p className="text-xs text-error-text">Top plate: {errors.topLb.message}</p>}
          {errors.plateLb && <p className="text-xs text-error-text">Plate: {errors.plateLb.message}</p>}
          {errors.plates && <p className="text-xs text-error-text">Plates: {errors.plates.message}</p>}
          <p className="text-xs text-text-muted-strong">Plates counts the top plate. Blank means no limit.</p>
        </div>
      )}
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
                      : 'bg-surface text-text-muted-strong border-border-strong hover:bg-bg'
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
        <button type="button" onClick={onCancel} className="text-sm text-text-muted-strong hover:text-text px-3 py-1.5">
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
        <WorkoutSection />
        <ActivityTypesSection />
        <ExerciseTypesSection />
        <ExercisesSection />
      </div>
    </Layout>
  )
}
