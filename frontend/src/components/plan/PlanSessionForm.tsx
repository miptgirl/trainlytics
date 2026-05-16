import { useEffect, useState } from 'react'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { TimeInput } from '../TimeInput'
import {
  useAddPlannedSession,
  useUpdatePlannedSession,
  type PlannedSessionOut,
} from '../../lib/planApi'

interface CardioType {
  id: number
  name: string
}

interface TemplateSummary {
  id: number
  name: string
}

interface PlanSegmentFormValues {
  activity_type_id: string
  title: string
  duration_secs: number | null
  distance_km: string
  pace_secs_per_km: number | null
  notes: string
}

interface PlanSessionFormValues {
  session_type: 'strength' | 'cardio'
  planned_date: string
  template_id: string
  title: string
  notes: string
  segments: PlanSegmentFormValues[]
}

function emptySegment(): PlanSegmentFormValues {
  return {
    activity_type_id: '',
    title: '',
    duration_secs: null,
    distance_km: '',
    pace_secs_per_km: null,
    notes: '',
  }
}

function getDaysOfWeek(weekStart: string): string[] {
  const days: string[] = []
  const start = new Date(weekStart + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function formatDayShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
}

interface PlanSessionFormProps {
  weekStart: string
  initialDate: string
  editingSession?: PlannedSessionOut
  onClose: () => void
}

export function PlanSessionForm({
  weekStart,
  initialDate,
  editingSession,
  onClose,
}: PlanSessionFormProps) {
  const isEditMode = !!editingSession
  const [titleTouched, setTitleTouched] = useState(isEditMode)

  const addMutation = useAddPlannedSession()
  const updateMutation = useUpdatePlannedSession()

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardioTypes'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
    staleTime: Infinity,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'strength'],
    queryFn: () => api.get<TemplateSummary[]>('/templates/strength'),
  })

  const defaultValues: PlanSessionFormValues = editingSession
    ? {
        session_type: editingSession.session_type,
        planned_date: editingSession.planned_date,
        template_id:
          editingSession.template_id != null ? String(editingSession.template_id) : '',
        title: editingSession.title ?? '',
        notes: editingSession.notes ?? '',
        segments:
          editingSession.segments.length > 0
            ? editingSession.segments.map((s) => ({
                activity_type_id: String(s.activity_type_id),
                title: s.title ?? '',
                duration_secs: s.duration_secs,
                distance_km:
                  s.distance_metres != null ? String(s.distance_metres / 1000) : '',
                pace_secs_per_km: s.pace_secs_per_km,
                notes: s.notes ?? '',
              }))
            : [emptySegment()],
      }
    : {
        session_type: 'strength',
        planned_date: initialDate,
        template_id: '',
        title: '',
        notes: '',
        segments: [emptySegment()],
      }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<PlanSessionFormValues>({ defaultValues })

  const sessionType = useWatch({ control, name: 'session_type' })
  const plannedDate = useWatch({ control, name: 'planned_date' })
  const templateId = useWatch({ control, name: 'template_id' })
  const watchedSegments = useWatch({ control, name: 'segments' })

  // Auto-fill title from template name for strength sessions
  useEffect(() => {
    if (titleTouched || sessionType !== 'strength') return
    const tpl = templates.find((t) => String(t.id) === templateId)
    setValue('title', tpl ? tpl.name : '')
  }, [templateId, templates, titleTouched, sessionType, setValue])

  // Auto-calculate pace from distance and duration per segment
  useEffect(() => {
    watchedSegments.forEach((seg, index) => {
      const dist = parseFloat(seg.distance_km)
      const dur = seg.duration_secs
      if (!isNaN(dist) && dist > 0 && dur != null && dur > 0) {
        const newPace = Math.round(dur / dist)
        if (newPace !== seg.pace_secs_per_km) {
          setValue(`segments.${index}.pace_secs_per_km`, newPace, { shouldValidate: false })
        }
      }
    })
  }, [watchedSegments, setValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const { fields, append, remove } = useFieldArray({ control, name: 'segments' })
  const days = getDaysOfWeek(weekStart)

  function buildPayload(data: PlanSessionFormValues) {
    if (data.session_type === 'strength') {
      return {
        planned_date: data.planned_date,
        session_type: 'strength' as const,
        template_id: data.template_id ? parseInt(data.template_id, 10) : null,
        title: data.title || null,
        notes: data.notes || null,
      }
    }
    return {
      planned_date: data.planned_date,
      session_type: 'cardio' as const,
      notes: data.notes || null,
      segments: data.segments.map((seg, i) => {
        const distKm = parseFloat(seg.distance_km)
        return {
          segment_order: i + 1,
          activity_type_id: parseInt(seg.activity_type_id, 10),
          title: seg.title || null,
          duration_secs: seg.duration_secs,
          distance_metres: !isNaN(distKm) && distKm > 0 ? Math.round(distKm * 1000) : null,
          pace_secs_per_km: seg.pace_secs_per_km,
          notes: seg.notes || null,
        }
      }),
    }
  }

  function onSubmit(data: PlanSessionFormValues) {
    const payload = buildPayload(data)
    if (isEditMode && editingSession) {
      updateMutation.mutate(
        { weekStart, sessionId: editingSession.id, body: payload },
        { onSuccess: onClose },
      )
    } else {
      addMutation.mutate({ weekStart, body: payload }, { onSuccess: onClose })
    }
  }

  const isPending = addMutation.isPending || updateMutation.isPending
  const mutationError = addMutation.error || updateMutation.error

  const modalTitle = isEditMode
    ? editingSession!.status === 'skipped'
      ? 'Swap Session'
      : 'Edit Session'
    : 'Add Session'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{modalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Session type toggle */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">Session Type</span>
              <div className="flex gap-2">
                {(['strength', 'cardio'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={isEditMode}
                    onClick={() => !isEditMode && setValue('session_type', type)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      sessionType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {type === 'strength' ? 'Strength' : 'Cardio'}
                  </button>
                ))}
              </div>
            </div>

            {/* Date selector (days of week) */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">Date</span>
              <div className="flex gap-1.5 flex-wrap">
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setValue('planned_date', day)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      plannedDate === day
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {formatDayShort(day)}
                  </button>
                ))}
              </div>
            </div>

            {/* Strength fields */}
            {sessionType === 'strength' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template <span className="text-red-500">*</span>
                  </label>
                  <select
                    {...register('template_id', {
                      validate: (val, formValues) =>
                        formValues.session_type !== 'strength' || !!val || 'Template is required',
                    })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— select template —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {errors.template_id && (
                    <p className="mt-1 text-xs text-red-600">{errors.template_id.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-filled from template…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    {...register('title', { onChange: () => setTitleTouched(true) })}
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
            )}

            {/* Cardio fields */}
            {sessionType === 'cardio' && (
              <div className="space-y-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-2">Segments</span>
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="border border-gray-200 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">
                            Segment {index + 1}
                          </span>
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              aria-label="Remove segment"
                              className="p-1 text-gray-400 hover:text-red-500 rounded"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Activity Type <span className="text-red-500">*</span>
                          </label>
                          <select
                            {...register(`segments.${index}.activity_type_id`, {
                              validate: (val, formValues) =>
                                formValues.session_type !== 'cardio' || !!val || 'Required',
                            })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— select —</option>
                            {cardioTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          {errors.segments?.[index]?.activity_type_id && (
                            <p className="mt-0.5 text-xs text-red-600">
                              {errors.segments[index]?.activity_type_id?.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Title (optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Easy run"
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            {...register(`segments.${index}.title`)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Duration</label>
                            <Controller
                              control={control}
                              name={`segments.${index}.duration_secs`}
                              render={({ field }) => (
                                <TimeInput
                                  value={field.value}
                                  onChange={field.onChange}
                                  format="duration"
                                  placeholder="m:ss"
                                />
                              )}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Distance (km)
                            </label>
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
                              name={`segments.${index}.pace_secs_per_km`}
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
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Notes (optional)
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Optional notes for this segment…"
                            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            {...register(`segments.${index}.notes`)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => append(emptySegment())}
                    className="mt-3 w-full text-sm text-blue-600 hover:text-blue-800 font-medium border border-dashed border-blue-300 rounded-xl py-2"
                  >
                    + Add Segment
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Optional session notes…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    {...register('notes')}
                  />
                </div>
              </div>
            )}

            {mutationError && (
              <p className="text-sm text-red-600">{(mutationError as Error).message}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 shrink-0 flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm"
            >
              {isPending ? 'Saving…' : isEditMode ? 'Save Changes' : 'Add to Plan'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
