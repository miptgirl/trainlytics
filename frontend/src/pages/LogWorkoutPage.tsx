import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm, useWatch, Controller } from 'react-hook-form'
import { Layout } from '../components/Layout'
import {
  emptyEntry,
  ExerciseEntryBlock,
  type ExerciseEntryFormValues,
} from '../components/ExerciseEntryBlock'
import { TimeInput } from '../components/TimeInput'
import { api } from '../lib/api'
import { datetimeLocalToUTC, localDateTimeNow } from '../lib/dateUtils'
import { kmToMetres } from '../lib/unitUtils'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

type WorkoutType = 'cardio' | 'strength'

// ─────────────────────────────────────────────────────────────────────────────
// Cardio form types & helpers
// ─────────────────────────────────────────────────────────────────────────────

interface CardioType {
  id: number
  name: string
}

interface SegmentFormValues {
  title: string
  duration_seconds: number | null
  distance_km: string
  pace_seconds_per_km: number | null
  heart_rate_avg: string
}

interface CardioFormValues {
  title: string
  activity_type_id: string
  date: string
  notes: string
  total_duration_seconds: number | null
  calories: string
  segments: SegmentFormValues[]
}

function parseSeconds(val: string): number | undefined {
  const n = parseInt(val, 10)
  return isNaN(n) || n <= 0 ? undefined : n
}

// ─────────────────────────────────────────────────────────────────────────────
// Strength form types & helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Exercise {
  id: number
  name: string
  notes?: string | null
  types?: { id: number; name: string }[]
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

interface StrengthFormValues {
  title: string
  duration_seconds: number | null
  calories: string
  date: string
  notes: string
  exercises: ExerciseEntryFormValues[]
}

interface DiffState {
  formData: StrengthFormValues
  changes: string[]
}

const emptyStrengthDefaults = (): StrengthFormValues => ({
  title: 'Strength session',
  duration_seconds: null,
  calories: '',
  date: localDateTimeNow(),
  notes: '',
  exercises: [emptyEntry()],
})

function templateToFormValues(t: TemplateSnapshot): StrengthFormValues {
  return {
    title: t.name,
    duration_seconds: null,
    calories: '',
    date: localDateTimeNow(),
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
  formData: StrengthFormValues,
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

function toTemplatePayload(data: StrengthFormValues) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Cardio Form
// ─────────────────────────────────────────────────────────────────────────────

function CardioForm() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [titleTouched, setTitleTouched] = useState(false)

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
  })

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CardioFormValues>({
    defaultValues: {
      title: '',
      activity_type_id: '',
      date: localDateTimeNow(),
      notes: '',
      total_duration_seconds: null,
      calories: '',
      segments: [{ title: '', duration_seconds: null, distance_km: '', pace_seconds_per_km: null, heart_rate_avg: '' }],
    },
  })

  const watchedActivityTypeId = useWatch({ control, name: 'activity_type_id' })
  const watchedSegments = useWatch({ control, name: 'segments' })

  useEffect(() => {
    if (titleTouched) return
    const activityType = cardioTypes.find((t) => String(t.id) === watchedActivityTypeId)
    const totalKm = watchedSegments.reduce((sum, seg) => {
      const km = parseFloat(seg.distance_km)
      return sum + (isNaN(km) ? 0 : km)
    }, 0)
    const kmStr = totalKm % 1 === 0 ? String(totalKm) : totalKm.toFixed(2).replace(/\.?0+$/, '')
    const newTitle = activityType ? `${activityType.name} – ${kmStr} km` : `– ${kmStr} km`
    setValue('title', newTitle)
  }, [watchedActivityTypeId, watchedSegments, cardioTypes, titleTouched, setValue])

  const { fields, append, remove } = useFieldArray({ control, name: 'segments' })

  const createMutation = useMutation({
    mutationFn: (data: CardioFormValues) => {
      const payload = {
        title: data.title || null,
        activity_type_id: data.activity_type_id ? parseInt(data.activity_type_id, 10) : null,
        date: datetimeLocalToUTC(data.date),
        notes: data.notes || null,
        calories: data.calories ? parseInt(data.calories, 10) : null,
        total_duration_seconds: data.total_duration_seconds ?? null,
        segments: data.segments.map((seg, i) => {
          const distKm = parseFloat(seg.distance_km)
          return {
            order: i + 1,
            title: seg.title || null,
            duration_seconds: seg.duration_seconds ?? 0,
            distance_meters: !isNaN(distKm) ? kmToMetres(distKm) : null,
            pace_seconds_per_km: seg.pace_seconds_per_km ?? null,
            heart_rate_avg: parseSeconds(seg.heart_rate_avg) ?? null,
          }
        }),
      }
      return api.post<{ id: number }>('/sessions/cardio', payload)
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  return (
    <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
      {/* Basic fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            placeholder="Optional session title…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('title', {
              onChange: () => setTitleTouched(true),
            })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('activity_type_id')}
          >
            <option value="">— select type —</option>
            {cardioTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Total Duration (optional override)</label>
          <Controller
            control={control}
            name="total_duration_seconds"
            render={({ field }) => (
              <TimeInput
                value={field.value}
                onChange={field.onChange}
                format="duration"
                placeholder="h:mm:ss"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Calories (kcal, optional)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 450"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('calories')}
          />
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

      {/* Segments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Segments</h2>
          <button
            type="button"
            onClick={() => append({ title: '', duration_seconds: null, distance_km: '', pace_seconds_per_km: null, heart_rate_avg: '' })}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Segment
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Segment {index + 1}</span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Segment Title</label>
                  <input
                    type="text"
                    placeholder="Optional title…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.title`)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Duration *</label>
                  <Controller
                    control={control}
                    name={`segments.${index}.duration_seconds`}
                    rules={{ validate: (v) => v != null || 'Required' }}
                    render={({ field }) => (
                      <TimeInput
                        value={field.value}
                        onChange={field.onChange}
                        format="duration"
                        placeholder="m:ss"
                      />
                    )}
                  />
                  {errors.segments?.[index]?.duration_seconds && (
                    <p className="mt-0.5 text-xs text-red-600">{errors.segments[index]?.duration_seconds?.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Distance (km)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 5.0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.distance_km`)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pace (/km)</label>
                  <Controller
                    control={control}
                    name={`segments.${index}.pace_seconds_per_km`}
                    render={({ field }) => (
                      <TimeInput
                        value={field.value}
                        onChange={field.onChange}
                        format="pace"
                        placeholder="m:ss"
                      />
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Avg Heart Rate (bpm)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 145"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register(`segments.${index}.heart_rate_avg`)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {createMutation.error && (
        <p className="text-sm text-red-600">{createMutation.error.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm"
        >
          {createMutation.isPending ? 'Saving…' : 'Save Session'}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Strength Form
// ─────────────────────────────────────────────────────────────────────────────

function StrengthForm({ initialTemplateId }: { initialTemplateId?: number }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [diffState, setDiffState] = useState<DiffState | null>(null)
  const [collapsedExercises, setCollapsedExercises] = useState<Set<number>>(new Set())
  const [titleTouched, setTitleTouched] = useState(false)

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
    getValues,
    formState: { errors },
  } = useForm<StrengthFormValues>({ defaultValues: emptyStrengthDefaults() })

  const {
    fields: exerciseFields,
    append: appendExercise,
    remove: removeExercise,
  } = useFieldArray({ control, name: 'exercises' })

  useEffect(() => {
    if (initialTemplateId) applyTemplate(initialTemplateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId])

  async function applyTemplate(id: number) {
    setIsLoadingTemplate(true)
    try {
      const detail = await api.get<TemplateSnapshot>(`/templates/strength/${id}`)
      setSelectedTemplateId(id)
      setTemplateSnapshot(detail)
      const newValues = templateToFormValues(detail)
      if (titleTouched) {
        newValues.title = getValues('title')
      }
      reset(newValues)
    } finally {
      setIsLoadingTemplate(false)
    }
  }

  function handleTemplateSelect(value: string) {
    if (!value) {
      setSelectedTemplateId(null)
      setTemplateSnapshot(null)
      const defaults = emptyStrengthDefaults()
      if (titleTouched) {
        defaults.title = getValues('title')
      }
      reset(defaults)
    } else {
      applyTemplate(parseInt(value, 10))
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: StrengthFormValues) =>
      api.post<{ id: number }>('/sessions/strength', {
        title: data.title || null,
        duration_seconds: data.duration_seconds ?? null,
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
      }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  const patchTemplateMutation = useMutation({
    mutationFn: (data: StrengthFormValues) =>
      api.patch(`/templates/strength/${templateSnapshot!.id}`, toTemplatePayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
    },
  })

  function handleFormSubmit(data: StrengthFormValues) {
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
    <>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              placeholder="Optional session title…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('title', { onChange: () => setTitleTouched(true) })}
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
              placeholder="Optional notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              {...register('notes')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
            <Controller
              control={control}
              name="duration_seconds"
              render={({ field }) => (
                <TimeInput
                  value={field.value}
                  onChange={field.onChange}
                  format="duration"
                  placeholder="h:mm:ss (optional)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
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

        {/* Exercises */}
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
                showDone={templateSnapshot !== null}
                isCollapsed={collapsedExercises.has(exIndex)}
                onToggleCollapse={() =>
                  setCollapsedExercises((prev) => {
                    const next = new Set(prev)
                    if (next.has(exIndex)) next.delete(exIndex)
                    else next.add(exIndex)
                    return next
                  })
                }
                onAutoCollapse={() =>
                  setCollapsedExercises((prev) => new Set(prev).add(exIndex))
                }
                onAutoExpand={() =>
                  setCollapsedExercises((prev) => {
                    const next = new Set(prev)
                    next.delete(exIndex)
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
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff modal
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LogWorkoutPage() {
  const [searchParams] = useSearchParams()
  const templateIdParam = searchParams.get('templateId')

  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(
    templateIdParam ? 'strength' : null,
  )

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Log Workout</h1>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          type="button"
          onClick={() => setWorkoutType('cardio')}
          className={`rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all ${
            workoutType === 'cardio'
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          <span className="text-3xl">🏃</span>
          <span className="text-base font-semibold">Cardio</span>
        </button>
        <button
          type="button"
          onClick={() => setWorkoutType('strength')}
          className={`rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all ${
            workoutType === 'strength'
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          <span className="text-3xl">🏋️</span>
          <span className="text-base font-semibold">Strength</span>
        </button>
      </div>

      {/* Form */}
      {workoutType === 'cardio' && <CardioForm />}
      {workoutType === 'strength' && (
        <StrengthForm
          initialTemplateId={templateIdParam ? parseInt(templateIdParam, 10) : undefined}
        />
      )}
    </Layout>
  )
}
