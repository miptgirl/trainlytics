import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import {
  emptyEntry,
  ExerciseEntryBlock,
  type ExerciseEntryFormValues,
} from '../components/ExerciseEntryBlock'
import { api } from '../lib/api'

interface Exercise {
  id: number
  name: string
}

interface FormValues {
  date: string
  notes: string
  exercises: ExerciseEntryFormValues[]
}

export default function LogStrengthPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      exercises: [emptyEntry()],
    },
  })

  const {
    fields: exerciseFields,
    append: appendExercise,
    remove: removeExercise,
  } = useFieldArray({ control, name: 'exercises' })

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload = {
        date: data.date,
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
      return api.post<{ id: number }>('/sessions/strength', payload)
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Log Strength Session</h1>
      </div>

      <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
        {/* Basic fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('date', { required: 'Date is required' })}
            />
            {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
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

        {/* Exercises */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Exercises</h2>
            <button
              type="button"
              onClick={() => appendExercise(emptyEntry())}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Exercise
            </button>
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
                onRemove={() => removeExercise(exIndex)}
                errors={errors}
              />
            ))}
          </div>
        </div>

        {createMutation.isError && (
          <p className="text-sm text-red-600">Failed to save session. Please try again.</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving…' : 'Save Session'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Layout>
  )
}

