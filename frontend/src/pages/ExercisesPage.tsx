import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

interface ExerciseTypeTag {
  id: number
  name: string
}

interface Exercise {
  id: number
  name: string
  notes: string | null
  created_at: string
  types: ExerciseTypeTag[]
}

interface ExerciseRef {
  id: number
  name: string
}

interface ExerciseFormValues {
  name: string
  notes: string
}

function fetchExercises(): Promise<Exercise[]> {
  return api.get<Exercise[]>('/exercises')
}

export default function ExercisesPage() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exercises'],
    queryFn: fetchExercises,
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; notes?: string }) =>
      api.post<Exercise>('/exercises', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] })
      setEditingId(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; notes?: string }) =>
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
        <h1 className="text-2xl font-bold text-slate-900">Exercises</h1>
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
          onSubmit={(values) =>
            createMutation.mutate({ name: values.name, notes: values.notes || undefined })
          }
          onCancel={() => setEditingId(null)}
          isPending={createMutation.isPending}
        />
      )}

      {exercises.length === 0 && editingId !== 'new' ? (
        <p className="text-gray-400 text-sm">No exercises yet. Add your first one.</p>
      ) : (
        <ul className="space-y-2">
          {exercises.map((ex) =>
            editingId === ex.id ? (
              <li key={ex.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <ExerciseForm
                  exerciseId={ex.id}
                  allExercises={exercises}
                  defaultValues={{ name: ex.name, notes: ex.notes ?? '' }}
                  onSubmit={(values) =>
                    updateMutation.mutate({
                      id: ex.id,
                      name: values.name,
                      notes: values.notes || undefined,
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
    </Layout>
  )
}

function ExerciseForm({
  exerciseId,
  allExercises,
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
  exerciseId?: number
  allExercises?: Exercise[]
  defaultValues?: ExerciseFormValues
  onSubmit: (values: ExerciseFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<ExerciseFormValues>({
    defaultValues: defaultValues ?? { name: '', notes: '' },
  })

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

      {exerciseId !== undefined && allExercises !== undefined && (
        <ReplacementsSection exerciseId={exerciseId} allExercises={allExercises} />
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Replacements Section
// ─────────────────────────────────────────────────────────────────────────────

function ReplacementsSection({
  exerciseId,
  allExercises,
}: {
  exerciseId: number
  allExercises: Exercise[]
}) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reverseCandidate, setReverseCandidate] = useState<ExerciseRef | null>(null)

  const { data: replacements = [] } = useQuery({
    queryKey: ['replacements', exerciseId],
    queryFn: () => api.get<ExerciseRef[]>(`/exercises/${exerciseId}/replacements`),
  })

  const addMutation = useMutation({
    mutationFn: (replacementId: number) =>
      api.post<ExerciseRef[]>(`/exercises/${exerciseId}/replacements`, {
        replacement_id: replacementId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['replacements', exerciseId] })
    },
  })

  const addReverseMutation = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) =>
      api.post<ExerciseRef[]>(`/exercises/${sourceId}/replacements`, {
        replacement_id: targetId,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['replacements', vars.sourceId] })
      setReverseCandidate(null)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (replacementId: number) =>
      api.delete<ExerciseRef[]>(`/exercises/${exerciseId}/replacements/${replacementId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['replacements', exerciseId] })
    },
  })

  function handleSelect(selected: ExerciseRef) {
    setPickerOpen(false)
    addMutation.mutate(selected.id, {
      onSuccess: () => setReverseCandidate(selected),
    })
  }

  const replacementIds = new Set(replacements.map((r) => r.id))

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-sm font-medium text-gray-700 mb-2">Replacements</p>

      {replacements.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">No replacements configured.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {replacements.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-800">{r.name}</span>
              <button
                type="button"
                onClick={() => removeMutation.mutate(r.id)}
                disabled={removeMutation.isPending}
                className="text-gray-400 hover:text-red-500 disabled:opacity-40 text-base leading-none px-1"
                aria-label={`Remove ${r.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {reverseCandidate && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 text-sm">
          <p className="text-blue-800 mb-1.5">
            Also add <strong>{allExercises.find((e) => e.id === exerciseId)?.name}</strong> as a
            replacement for <strong>{reverseCandidate.name}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                addReverseMutation.mutate({
                  sourceId: reverseCandidate.id,
                  targetId: exerciseId,
                })
              }
              disabled={addReverseMutation.isPending}
              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded-md font-medium"
            >
              {addReverseMutation.isPending ? 'Adding…' : 'Yes, add reverse'}
            </button>
            <button
              type="button"
              onClick={() => setReverseCandidate(null)}
              className="text-xs text-blue-700 hover:text-blue-900 px-2 py-1"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
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

// ─────────────────────────────────────────────────────────────────────────────
// Replacement Picker Modal
// Shows all exercises grouped by type tag with a search filter.
// ─────────────────────────────────────────────────────────────────────────────

function groupExercises(
  exercises: Exercise[],
): { label: string; items: Exercise[] }[] {
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
    .map(([label, items]) => ({
      label,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
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

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const candidates = allExercises.filter((ex) => !excludeIds.has(ex.id))

  const filtered = search.trim()
    ? candidates.filter((ex) => ex.name.toLowerCase().includes(search.toLowerCase()))
    : candidates

  const groups = groupExercises(filtered)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Add replacement</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No exercises found.</p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {group.label}
                </p>
                {group.items.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => onSelect({ id: ex.id, name: ex.name })}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700"
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
