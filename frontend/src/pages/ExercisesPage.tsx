import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

interface Exercise {
  id: number
  name: string
  notes: string | null
  created_at: string
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
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
}: {
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
