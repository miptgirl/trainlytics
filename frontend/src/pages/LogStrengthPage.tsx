import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { Layout } from '../components/Layout'
import {
  emptyEntry,
  ExerciseEntryBlock,
  type ExerciseEntryFormValues,
} from '../components/ExerciseEntryBlock'
import { api } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Exercise {
  id: number
  name: string
}

interface TemplateSummary {
  id: number
  name: string
}

export interface TemplateSet {
  set_number: number
  reps: number | null
  weight_kg: number | null
  notes: string | null
}

export interface TemplateExercise {
  exercise_id: number
  exercise_name: string
  order: number
  sets: TemplateSet[]
}

export interface TemplateSnapshot {
  id: number
  name: string
  exercises: TemplateExercise[]
}

interface FormValues {
  date: string
  notes: string
  exercises: ExerciseEntryFormValues[]
}

interface DiffState {
  formData: FormValues
  changes: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)
const emptyDefaults = (): FormValues => ({
  date: today(),
  notes: '',
  exercises: [emptyEntry()],
})

function templateToFormValues(t: TemplateSnapshot): FormValues {
  return {
    date: today(),
    notes: '',
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

function computeDiff(
  snapshot: TemplateSnapshot,
  formData: FormValues,
  exerciseMap: Map<number, string>,
): string[] {
  const changes: string[] = []
  const tmpl = snapshot.exercises
  const form = formData.exercises
  const len = Math.max(tmpl.length, form.length)

  for (let i = 0; i < len; i++) {
    const te = tmpl[i]
    const fe = form[i]

    if (!te && fe) {
      const name = exerciseMap.get(parseInt(fe.exercise_id, 10)) ?? 'Unknown exercise'
      changes.push(`Added ${name}`)
      continue
    }
    if (te && !fe) {
      changes.push(`Removed ${te.exercise_name}`)
      continue
    }

    const feId = parseInt(fe!.exercise_id, 10)
    if (feId !== te!.exercise_id) {
      const newName = exerciseMap.get(feId) ?? 'Unknown exercise'
      changes.push(`Replaced ${te!.exercise_name} with ${newName}`)
      continue
    }

    const name = te!.exercise_name
    const tSets = te!.sets
    const fSets = fe!.sets

    if (fSets.length !== tSets.length) {
      const diff = fSets.length - tSets.length
      if (diff > 0) {
        changes.push(`Added ${diff} set${diff > 1 ? 's' : ''} to ${name}`)
      } else {
        changes.push(`Removed ${-diff} set${-diff > 1 ? 's' : ''} from ${name}`)
      }
    }

    const minSets = Math.min(tSets.length, fSets.length)
    for (let j = 0; j < minSets; j++) {
      const ts = tSets[j]
      const fs = fSets[j]
      const fReps = fs.reps ? parseInt(fs.reps, 10) : null
      const fWeight = fs.weight ? parseFloat(fs.weight) : null
      const fNotes = fs.notes || null
      if (fReps !== ts.reps) changes.push(`Changed reps on ${name} set ${j + 1}`)
      if (fWeight !== ts.weight_kg) changes.push(`Changed weight on ${name} set ${j + 1}`)
      if (fNotes !== ts.notes) changes.push(`Changed notes on ${name} set ${j + 1}`)
    }
  }

  return changes
}

function toTemplatePayload(data: FormValues) {
  return {
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

export default function LogStrengthPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [diffState, setDiffState] = useState<DiffState | null>(null)

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'strength'],
    queryFn: () => api.get<TemplateSummary[]>('/templates/strength'),
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: emptyDefaults() })

  const {
    fields: exerciseFields,
    append: appendExercise,
    remove: removeExercise,
  } = useFieldArray({ control, name: 'exercises' })

  useEffect(() => {
    const raw = searchParams.get('templateId')
    if (raw) applyTemplate(parseInt(raw, 10))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function applyTemplate(id: number) {
    setIsLoadingTemplate(true)
    try {
      const detail = await api.get<TemplateSnapshot>(`/templates/strength/${id}`)
      setSelectedTemplateId(id)
      setTemplateSnapshot(detail)
      reset(templateToFormValues(detail))
    } finally {
      setIsLoadingTemplate(false)
    }
  }

  function handleTemplateSelect(value: string) {
    if (!value) {
      setSelectedTemplateId(null)
      setTemplateSnapshot(null)
      reset(emptyDefaults())
    } else {
      applyTemplate(parseInt(value, 10))
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post<{ id: number }>('/sessions/strength', {
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
      }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  const patchTemplateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.patch(`/templates/strength/${templateSnapshot!.id}`, toTemplatePayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
    },
  })

  function handleFormSubmit(data: FormValues) {
    if (!templateSnapshot) {
      createMutation.mutate(data)
      return
    }
    const exerciseMap = new Map(exercises.map((e) => [e.id, e.name]))
    const changes = computeDiff(templateSnapshot, data, exerciseMap)
    if (changes.length === 0) {
      createMutation.mutate(data)
      return
    }
    setDiffState({ formData: data, changes })
  }

  async function handleYesUpdateTemplate() {
    if (!diffState) return
    try {
      await patchTemplateMutation.mutateAsync(diffState.formData)
      setDiffState(null)
      createMutation.mutate(diffState.formData)
    } catch {
      // patchTemplateMutation.isError shows the error in the modal
    }
  }

  function handleNoKeepTemplate() {
    if (!diffState) return
    const data = diffState.formData
    setDiffState(null)
    createMutation.mutate(data)
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Log Strength Session</h1>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Template selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start from template
          </label>
          <select
            value={selectedTemplateId ?? ''}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            disabled={isLoadingTemplate}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">— no template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {isLoadingTemplate && (
            <p className="mt-1 text-xs text-gray-400">Loading template…</p>
          )}
          {templateSnapshot && !isLoadingTemplate && (
            <p className="mt-1 text-xs text-gray-500">
              Pre-filled from <span className="font-medium">{templateSnapshot.name}</span> — all fields are editable.
            </p>
          )}
        </div>

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
                showDone={templateSnapshot !== null}
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

      {/* Diff modal */}
      {diffState && (
        <DiffModal
          templateName={templateSnapshot!.name}
          changes={diffState.changes}
          onYes={handleYesUpdateTemplate}
          onNo={handleNoKeepTemplate}
          onCancel={() => setDiffState(null)}
          isPending={patchTemplateMutation.isPending || createMutation.isPending}
          isError={patchTemplateMutation.isError}
        />
      )}
    </Layout>
  )
}

// ── Diff modal ────────────────────────────────────────────────────────────────

function DiffModal({
  templateName,
  changes,
  onYes,
  onNo,
  onCancel,
  isPending,
  isError,
}: {
  templateName: string
  changes: string[]
  onYes: () => void
  onNo: () => void
  onCancel: () => void
  isPending: boolean
  isError: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!isPending ? onCancel : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Update template "{templateName}"?
        </h2>
        <p className="text-sm text-gray-600">
          Your session differs from the template:
        </p>
        <ul className="space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-gray-400">·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-600">
          Save these changes back to the template?
        </p>

        {isError && (
          <p className="text-sm text-red-600">Failed to update template. Try again.</p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onYes}
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl"
          >
            {isPending ? 'Saving…' : 'Yes, update template'}
          </button>
          <button
            onClick={onNo}
            disabled={isPending}
            className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 text-sm font-medium py-2.5 rounded-xl"
          >
            No, keep template as-is
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="w-full text-gray-500 hover:text-gray-700 disabled:opacity-50 text-sm py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
