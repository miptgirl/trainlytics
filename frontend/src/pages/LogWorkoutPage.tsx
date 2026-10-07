import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type PlannedSessionOut, type WeekPlanOut } from '../lib/planApi'
import { EraserIcon } from '../components/EraserIcon'
import { useFieldArray, useForm, useWatch, Controller } from 'react-hook-form'
import { Layout } from '../components/Layout'
import { TimeInput } from '../components/TimeInput'
import { api } from '../lib/api'
import { datetimeLocalToUTC, getMondayOfCurrentWeek, localDateTimeNow, toLocalDateStr } from '../lib/dateUtils'
import { saveDraft, loadDraft, clearDraft, parseCardioDraft, serializeCardioDraft } from '../lib/draftUtils'
import { kmToMetres } from '../lib/unitUtils'
import { StrengthExerciseList } from '../components/StrengthExerciseList'
import { EmojiRating } from '../components/EmojiRating'
import { WELLBEING_OPTIONS, RPE_OPTIONS } from '../components/emojiRatingOptions'
import { AdaptSessionModal } from '../components/AdaptSessionModal'
import { AdaptCardioModal } from '../components/plan/AdaptCardioModal'
import { HrInputSection } from '../components/HrInputSection'
import { DiffModal } from '../components/DiffModal'
import { useStrengthSessionForm } from '../lib/hooks/useStrengthSessionForm'
import { describeDraft, strengthViewUrl, type TemplateSummary } from '../lib/strengthSession'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

type WorkoutType = 'cardio' | 'strength'

/** Save/Cancel row: pinned to the bottom of the screen below md, plain at the end of the form above. */
const PINNED_ACTIONS =
  'max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:-mb-6 max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:bg-surface max-md:border-t max-md:border-border'

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
}

interface CardioFormValues {
  title: string
  activity_type_id: string
  date: string
  notes: string
  total_duration_seconds: number | null
  calories: string
  wellbeing: number | null
  rpe: number | null
  segments: SegmentFormValues[]
  avg_hr_bpm: string
  z1_seconds: number | null
  z2_seconds: number | null
  z3_seconds: number | null
  z4_seconds: number | null
  z5_seconds: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Strength form types & helpers (logic lives in useStrengthSessionForm)
// ─────────────────────────────────────────────────────────────────────────────

export type { TemplateSet, TemplateExercise, TemplateSnapshot } from '../lib/strengthSession'


// ─────────────────────────────────────────────────────────────────────────────
// Cardio Form
// ─────────────────────────────────────────────────────────────────────────────

function CardioForm({
  initialPlannedSessionId,
  initialWeekStart,
}: {
  initialPlannedSessionId?: number
  initialWeekStart?: string
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [titleTouched, setTitleTouched] = useState(false)
  const [showAdaptCardioModal, setShowAdaptCardioModal] = useState(false)
  // 'none' | 'draft' (2-way) | 'three-way' (draft + planned session)
  const [bannerMode, setBannerMode] = useState<'none' | 'draft' | 'three-way'>('none')
  const [pendingDraft, setPendingDraft] = useState<CardioFormValues | null>(null)
  const hasMounted = useRef(false)
  const startupDone = useRef(false)

  const { data: cardioTypes = [] } = useQuery({
    queryKey: ['cardio-types'],
    queryFn: () => api.get<CardioType[]>('/cardio-types'),
  })

  const { data: profile } = useQuery<{ ai_key_configured: boolean }>({
    queryKey: ['profile'],
    queryFn: () => api.get('/profile'),
  })
  const hasApiKey = !!profile?.ai_key_configured

  const { data: weekPlanForCardio } = useQuery<{ sessions: PlannedSessionOut[] }>({
    queryKey: ['plans', initialWeekStart ?? ''],
    queryFn: () => api.get(`/plans/${initialWeekStart}`),
    enabled: !!initialWeekStart && !!initialPlannedSessionId,
  })

  const plannedSession: PlannedSessionOut | null =
    initialPlannedSessionId && weekPlanForCardio
      ? (weekPlanForCardio.sessions.find((s) => s.id === initialPlannedSessionId) ?? null)
      : null

  // Compute today's week start (Monday) for activity-type-based matching
  const todayWeekStart = getMondayOfCurrentWeek()
  const todayStr = toLocalDateStr(new Date())

  const { data: todayWeekPlan } = useQuery<WeekPlanOut>({
    queryKey: ['plans', todayWeekStart],
    queryFn: () => api.get(`/plans/${todayWeekStart}`),
    enabled: !initialPlannedSessionId,
  })

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<CardioFormValues>({
    defaultValues: {
      title: '',
      activity_type_id: '',
      date: localDateTimeNow(),
      notes: '',
      total_duration_seconds: null,
      calories: '',
      wellbeing: null,
      rpe: null,
      segments: [{ title: '', duration_seconds: null, distance_km: '', pace_seconds_per_km: null }],
      avg_hr_bpm: '',
      z1_seconds: null,
      z2_seconds: null,
      z3_seconds: null,
      z4_seconds: null,
      z5_seconds: null,
    },
  })

  const watchedActivityTypeId = useWatch({ control, name: 'activity_type_id' })
  const watchedSegments = useWatch({ control, name: 'segments' })
  const watchedFormValues = useWatch({ control })

  // Resolve planned_session_id for the AI adapt feature:
  // (a) from URL param, or (b) matching today's planned cardio by activity type
  const resolvedPlannedSessionId: number | null = (() => {
    if (initialPlannedSessionId) return initialPlannedSessionId
    if (!watchedActivityTypeId || !todayWeekPlan) return null
    const activityTypeId = parseInt(watchedActivityTypeId, 10)
    const match = todayWeekPlan.sessions.find(
      (s) =>
        s.session_type === 'cardio' &&
        s.planned_date === todayStr &&
        s.activity_type_id === activityTypeId,
    )
    return match?.id ?? null
  })()

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

  useEffect(() => {
    watchedSegments.forEach((seg, index) => {
      const dist = parseFloat(seg.distance_km)
      const dur = seg.duration_seconds
      if (!isNaN(dist) && dist > 0 && dur != null && dur > 0) {
        const newPace = Math.round(dur / dist)
        if (newPace !== seg.pace_seconds_per_km) {
          setValue(`segments.${index}.pace_seconds_per_km`, newPace, { shouldValidate: false })
        }
      }
    })
  }, [watchedSegments, setValue])  

  function injectPlannedSession(session: PlannedSessionOut) {
    const sessionDateStr = session.planned_date === todayStr
      ? localDateTimeNow()
      : `${session.planned_date}T10:00`
    setTitleTouched(true)
    reset({
      title: session.title ?? '',
      activity_type_id: session.activity_type_id != null ? String(session.activity_type_id) : '',
      date: sessionDateStr,
      notes: session.notes ?? '',
      total_duration_seconds: null,
      calories: '',
      wellbeing: null,
      rpe: null,
      segments:
        session.segments.length > 0
          ? session.segments.map((seg) => ({
              title: seg.title ?? '',
              duration_seconds: seg.duration_secs ?? null,
              distance_km:
                seg.distance_metres != null ? String(seg.distance_metres / 1000) : '',
              pace_seconds_per_km: seg.pace_secs_per_km ?? null,
            }))
          : [{ title: '', duration_seconds: null, distance_km: '', pace_seconds_per_km: null }],
    })
  }

  // Startup: decide whether to show draft banner, 3-way prompt, or auto-inject planned session.
  // Runs once all needed data is available (draft is sync; planned session requires the query).
  useEffect(() => {
    if (startupDone.current) return
    if (initialPlannedSessionId && !weekPlanForCardio) return // wait for query

    startupDone.current = true
    const draft = parseCardioDraft<CardioFormValues>(loadDraft('cardio'))

    if (draft && plannedSession) {
      setPendingDraft(draft)
      setBannerMode('three-way')
    } else if (draft) {
      setPendingDraft(draft)
      setBannerMode('draft')
    } else if (plannedSession) {
      injectPlannedSession(plannedSession)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekPlanForCardio, initialPlannedSessionId, plannedSession])

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    if (!isDirty) return
    saveDraft('cardio', serializeCardioDraft(watchedFormValues))
  }, [watchedFormValues, isDirty])

  function handleDiscard() {
    clearDraft('cardio')
    setBannerMode('none')
    setPendingDraft(null)
  }

  function handleRestore() {
    if (!pendingDraft) return
    setTitleTouched(true)
    reset(pendingDraft)
    setBannerMode('none')
    setPendingDraft(null)
  }

  function handleUsePlannedSession() {
    if (!plannedSession) return
    clearDraft('cardio')
    injectPlannedSession(plannedSession)
    setBannerMode('none')
    setPendingDraft(null)
  }

  function handleStartFresh() {
    clearDraft('cardio')
    setBannerMode('none')
    setPendingDraft(null)
  }

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
        wellbeing: data.wellbeing ?? null,
        rpe: data.rpe ?? null,
        avg_hr_bpm: data.avg_hr_bpm ? parseInt(data.avg_hr_bpm, 10) : null,
        z1_seconds: data.z1_seconds ?? null,
        z2_seconds: data.z2_seconds ?? null,
        z3_seconds: data.z3_seconds ?? null,
        z4_seconds: data.z4_seconds ?? null,
        z5_seconds: data.z5_seconds ?? null,
        segments: data.segments.map((seg, i) => {
          const distKm = parseFloat(seg.distance_km)
          return {
            order: i + 1,
            title: seg.title || null,
            duration_seconds: seg.duration_seconds ?? 0,
            distance_meters: !isNaN(distKm) ? kmToMetres(distKm) : null,
            pace_seconds_per_km: seg.pace_seconds_per_km ?? null,
          }
        }),
      }
      return api.post<{ id: number }>('/sessions/cardio', payload)
    },
    onSuccess: (session) => {
      clearDraft('cardio')
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
    onError: (err) => {
      console.error('[CardioForm] save failed:', err)
    },
  })

  return (
    <>
      {bannerMode === 'draft' && (
        <div className="mb-4 bg-warning/10 border border-warning/40 rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-sm text-warning-text">You have an unsaved Cardio draft.</span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestore}
              className="text-sm font-medium text-primary-dark hover:underline"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-sm font-medium text-text-muted-strong hover:text-text"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {bannerMode === 'three-way' && (
        <div className="mb-4 bg-warning/10 border border-warning/40 rounded-xl p-4 space-y-2">
          <p className="text-sm text-warning-text font-medium">
            You have a saved draft and a planned session. Which would you like to use?
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRestore}
              className="text-sm font-medium text-primary-dark hover:underline"
            >
              Restore saved draft
            </button>
            <span className="text-warning-text">·</span>
            <button
              type="button"
              onClick={handleUsePlannedSession}
              className="text-sm font-medium text-primary-dark hover:underline"
            >
              Use planned session
            </button>
            <span className="text-warning-text">·</span>
            <button
              type="button"
              onClick={handleStartFresh}
              className="text-sm font-medium text-text-muted-strong hover:text-text"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
      {/* Basic fields */}
      <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Title</label>
          <input
            type="text"
            placeholder="Optional session title…"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('title', {
              onChange: () => setTitleTouched(true),
            })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">Activity Type</label>
          <select
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('activity_type_id')}
          >
            <option value="">— select type —</option>
            {cardioTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('date', { required: 'Date is required' })}
          />
          {errors.date && <p className="mt-1 text-xs text-error-text">{errors.date.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">Total Duration (optional override)</label>
          <Controller
            control={control}
            name="total_duration_seconds"
            render={({ field }) => (
              <TimeInput
                value={field.value}
                onChange={field.onChange}
                format="duration"
                placeholder="h:mm:ss"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
              />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">Calories (kcal, optional)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 450"
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
            {...register('calories')}
          />
        </div>

        <Controller
          control={control}
          name="wellbeing"
          render={({ field }) => (
            <EmojiRating
              label="How are you feeling?"
              options={WELLBEING_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="rpe"
          render={({ field }) => (
            <EmojiRating
              label="How hard was that?"
              options={RPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <label className="block text-sm font-medium text-text mb-1">Notes</label>
          <div className="relative">
            <textarea
              rows={2}
              placeholder="Optional notes…"
              className={`w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark resize-none ${watchedFormValues.notes ? 'pr-8' : ''}`}
              {...register('notes')}
            />
            {watchedFormValues.notes && (
              <button
                type="button"
                onClick={() => setValue('notes', '')}
                className="absolute right-1 top-1 p-1.5 text-text-muted-strong hover:text-text"
                aria-label="Clear notes"
              >
                <EraserIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Adapt this session (shown when a matching planned cardio session is resolved) */}
      {resolvedPlannedSessionId !== null && (
        <div className="bg-surface rounded-xl border border-border p-4">
          {hasApiKey ? (
            <button
              type="button"
              onClick={() => setShowAdaptCardioModal(true)}
              className="w-full text-sm font-medium text-primary-dark hover:underline flex items-center gap-1.5"
            >
              <span>✨</span> Adapt this session
            </button>
          ) : (
            <p className="text-sm text-text-muted-strong">
              <a href="/profile" className="text-primary-dark hover:underline font-medium">
                Add an API key in Profile
              </a>{' '}
              to adapt this session with AI suggestions.
            </p>
          )}
        </div>
      )}

      {/* Segments */}
      <div>
        <h2 className="font-medium text-text mb-3">Segments</h2>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-text">Segment {index + 1}</span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="Remove segment"
                    className="p-1 text-text-muted-strong hover:text-error-text rounded"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-3">
                <div className="col-span-3 sm:col-span-2">
                  <label className="block text-xs text-text-muted-strong mb-1">Segment Title</label>
                  <input
                    type="text"
                    placeholder="Optional title…"
                    className="w-full border border-border-strong rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
                    {...register(`segments.${index}.title`)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted-strong mb-1">Duration *</label>
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
                    <p className="mt-0.5 text-xs text-error-text">{errors.segments[index]?.duration_seconds?.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-muted-strong mb-1">Distance (km)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 5.0"
                    className="w-full border border-border-strong rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
                    {...register(`segments.${index}.distance_km`)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted-strong mb-1">Pace (/km)</label>
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
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => append({ title: '', duration_seconds: null, distance_km: '', pace_seconds_per_km: null })}
          className="mt-3 w-full text-sm text-primary-dark hover:underline font-medium border border-dashed border-primary-light rounded-xl py-2"
        >
          + Add Segment
        </button>
      </div>

      <HrInputSection
        avgHrBpm={watchedFormValues.avg_hr_bpm ?? ''}
        onAvgHrBpmChange={(v) => setValue('avg_hr_bpm', v)}
        zoneSeconds={[
          watchedFormValues.z1_seconds ?? null,
          watchedFormValues.z2_seconds ?? null,
          watchedFormValues.z3_seconds ?? null,
          watchedFormValues.z4_seconds ?? null,
          watchedFormValues.z5_seconds ?? null,
        ]}
        onZoneChange={(i, v) => {
          const names = ['z1_seconds', 'z2_seconds', 'z3_seconds', 'z4_seconds', 'z5_seconds'] as const
          setValue(names[i], v)
        }}
      />

      <div className={PINNED_ACTIONS}>
        {/* Inside the pinned bar so a failed save is visible from anywhere in the form */}
        {createMutation.error && (
          <p role="alert" className="text-sm text-error-text mb-2">{createMutation.error.message}</p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white font-medium px-6 py-2 max-md:min-h-11 rounded-lg text-sm"
          >
            {createMutation.isPending ? 'Saving…' : 'Save Session'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-text-muted-strong hover:text-text px-4 py-2 max-md:min-h-11"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>

    {showAdaptCardioModal && resolvedPlannedSessionId !== null && (
      <AdaptCardioModal
        hasApiKey={hasApiKey}
        plannedSessionId={resolvedPlannedSessionId}
        onClose={() => setShowAdaptCardioModal(false)}
      />
    )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Strength Form
// ─────────────────────────────────────────────────────────────────────────────

function StrengthForm() {
  const navigate = useNavigate()
  const {
    form: { register, handleSubmit, control, setValue, formState: { errors } },
    values: watchedFormValues,
    exerciseLibrary: exercises,
    selectedTemplateId,
    templateSnapshot,
    isLoadingTemplate,
    selectTemplate,
    setTitleTouched,
    pendingDraft,
    restoreDraft: handleRestore,
    discardDraft: handleDiscard,
    requestSave: handleFormSubmit,
    saveMutation: createMutation,
    templateMutation: patchTemplateMutation,
    diffState,
    confirmTemplateUpdate: handleYesUpdateTemplate,
    keepTemplate: handleNoKeepTemplate,
    cancelDiff,
    adaptSnapshot: buildSessionSnapshot,
    params,
    persistDraft,
    isSaving,
    templateError,
    retryTemplate,
  } = useStrengthSessionForm()
  const showDraftBanner = pendingDraft !== null
  const [showAdaptModal, setShowAdaptModal] = useState(false)

  const { data: profile } = useQuery<{ ai_key_configured: boolean }>({
    queryKey: ['profile'],
    queryFn: () => api.get('/profile'),
  })
  const hasApiKey = !!profile?.ai_key_configured

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'strength'],
    queryFn: () => api.get<TemplateSummary[]>('/templates/strength'),
  })

  function handleTemplateSelect(value: string) {
    void selectTemplate(value ? parseInt(value, 10) : null)
  }

  function handleWorkoutMode() {
    // Hand the current state over through the draft, unless a stored draft is
    // still waiting for Restore/Discard (workout mode then asks the same question)
    const resume = pendingDraft === null
    if (resume) persistDraft()
    // replace: Back from workout mode must not land on a stale form entry (B1)
    navigate(strengthViewUrl('workout', params, { resume }), { replace: true })
  }

  return (
    <>
      {showDraftBanner && (
        <div className="mb-4 bg-warning/10 border border-warning/40 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm text-warning-text">You have an unsaved Strength draft.</span>
            <p className="text-xs text-warning-text">{describeDraft(pendingDraft)} · Restore or discard it to save.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestore}
              disabled={isLoadingTemplate}
              className="text-sm font-medium text-primary-dark hover:underline disabled:opacity-50"
            >
              {isLoadingTemplate ? 'Restoring…' : 'Restore'}
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isLoadingTemplate}
              className="text-sm font-medium text-text-muted-strong hover:text-text disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleWorkoutMode}
          disabled={isLoadingTemplate}
          className="min-h-11 px-4 rounded-xl border border-border bg-surface text-sm font-medium text-primary-dark disabled:opacity-50"
        >
          Workout mode
        </button>
      </div>
      {/* Inert while a stored draft awaits Restore/Discard (edits would be lost) and while saving */}
      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        inert={showDraftBanner || isSaving}
        className={`space-y-6 ${showDraftBanner ? 'opacity-50' : ''}`}
      >
        {/* Template selector */}
        <div className="bg-surface rounded-xl border border-border p-4">
          <label className="block text-sm font-medium text-text mb-1">
            Start from template
          </label>
          <select
            value={selectedTemplateId ?? ''}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            disabled={isLoadingTemplate}
            className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark disabled:opacity-50"
          >
            <option value="">— no template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templateError && (
            <p role="alert" className="mt-1 text-xs text-error-text">
              {templateError}{' '}
              <button type="button" onClick={retryTemplate} className="min-h-11 font-medium underline">
                Retry
              </button>
            </p>
          )}
          {isLoadingTemplate && (
            <p className="mt-1 text-xs text-text-muted-strong">Loading template…</p>
          )}
          {templateSnapshot && !isLoadingTemplate && (
            <p className="mt-1 text-xs text-text-muted-strong">
              Pre-filled from <span className="font-medium">{templateSnapshot.name}</span> — all fields are editable.
            </p>
          )}
        </div>

        {/* Adapt this session */}
        <div className="bg-surface rounded-xl border border-border p-4">
          {hasApiKey ? (
            <button
              type="button"
              onClick={() => setShowAdaptModal(true)}
              className="w-full text-sm font-medium text-primary-dark hover:underline flex items-center gap-1.5"
            >
              <span>✨</span> Adapt this session
            </button>
          ) : (
            <p className="text-sm text-text-muted-strong">
              <a href="/profile" className="text-primary-dark hover:underline font-medium">
                Add an API key in Profile
              </a>{' '}
              to adapt this session with AI suggestions.
            </p>
          )}
        </div>

        {/* Basic fields */}
        <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">Title</label>
            <input
              type="text"
              placeholder="Optional session title…"
              className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
              {...register('title', { onChange: () => setTitleTouched(true) })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Date & Time</label>
            <input
              type="datetime-local"
              className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
              {...register('date', { required: 'Date is required' })}
            />
            {errors.date && <p className="mt-1 text-xs text-error-text">{errors.date.message}</p>}
          </div>
          <Controller
            control={control}
            name="wellbeing"
            render={({ field }) => (
              <EmojiRating
                label="How are you feeling?"
                options={WELLBEING_OPTIONS}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="rpe"
            render={({ field }) => (
              <EmojiRating
                label="How hard was that?"
                options={RPE_OPTIONS}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <div>
            <label className="block text-sm font-medium text-text mb-1">Notes</label>
            <div className="relative">
              <textarea
                rows={2}
                placeholder="Optional notes…"
                className={`w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark resize-none ${watchedFormValues.notes ? 'pr-8' : ''}`}
                {...register('notes')}
              />
              {watchedFormValues.notes && (
                <button
                  type="button"
                  onClick={() => setValue('notes', '')}
                  className="absolute right-1 top-1 p-1.5 text-text-muted-strong hover:text-text"
                  aria-label="Clear notes"
                >
                  <EraserIcon />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Duration</label>
            <Controller
              control={control}
              name="duration_seconds"
              render={({ field }) => (
                <TimeInput
                  value={field.value}
                  onChange={field.onChange}
                  format="duration"
                  placeholder="h:mm:ss (optional)"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
                />
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Calories (kcal, optional)</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 500"
              className="w-full border border-border-strong rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-dark"
              {...register('calories')}
            />
          </div>
        </div>

        {/* Exercises */}
        <StrengthExerciseList
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
          exercises={exercises}
          showDone={templateSnapshot !== null}
        />

        <div className={PINNED_ACTIONS}>
          {/* Inside the pinned bar so a failed save is visible from anywhere in the form */}
          {createMutation.isError && (
            <p role="alert" className="text-sm text-error-text mb-2">Failed to save session. Please try again.</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving || showDraftBanner}
              className="flex-1 bg-primary-dark text-white py-2.5 max-md:min-h-11 rounded-xl text-sm font-medium hover:brightness-95 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Session'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2.5 max-md:min-h-11 rounded-xl text-sm font-medium border border-border text-text hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      {/* Diff modal */}
      {diffState && (
        <DiffModal
          templateName={templateSnapshot!.name}
          changes={diffState.changes}
          onYes={handleYesUpdateTemplate}
          onNo={handleNoKeepTemplate}
          onCancel={cancelDiff}
          isPending={patchTemplateMutation.isPending || createMutation.isPending}
          isError={patchTemplateMutation.isError}
        />
      )}

      {/* Adapt session modal */}
      {showAdaptModal && (
        <AdaptSessionModal
          hasApiKey={hasApiKey}
          sessionSnapshot={buildSessionSnapshot()}
          onClose={() => setShowAdaptModal(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LogWorkoutPage() {
  const [searchParams] = useSearchParams()
  const templateIdParam = searchParams.get('templateId')
  const typeParam = searchParams.get('type')
  const plannedSessionIdParam = searchParams.get('plannedSessionId')
  const weekStartParam = searchParams.get('weekStart')

  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(
    typeParam === 'cardio'
      ? 'cardio'
      : typeParam === 'strength' || templateIdParam
        ? 'strength'
        : null,
  )

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text">Log Workout</h1>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          type="button"
          onClick={() => setWorkoutType('cardio')}
          className={`rounded-xl border-2 p-6 flex flex-col items-center gap-2 transition-all ${
            workoutType === 'cardio'
              ? 'border-primary-dark bg-primary-tint text-primary-dark'
              : 'border-border-strong bg-surface text-text hover:bg-primary-tint/50'
          }`}
        >
          <span className="text-3xl">🏃</span>
          <span className="text-base font-semibold">Cardio</span>
        </button>
        <button
          type="button"
          onClick={() => setWorkoutType('strength')}
          className={`rounded-xl border-2 p-6 flex flex-col items-center gap-2 transition-all ${
            workoutType === 'strength'
              ? 'border-primary-dark bg-primary-tint text-primary-dark'
              : 'border-border-strong bg-surface text-text hover:bg-primary-tint/50'
          }`}
        >
          <span className="text-3xl">🏋️</span>
          <span className="text-base font-semibold">Strength</span>
        </button>
      </div>

      {/* Form */}
      {workoutType === 'cardio' && (
        <CardioForm
          initialPlannedSessionId={plannedSessionIdParam ? parseInt(plannedSessionIdParam, 10) : undefined}
          initialWeekStart={weekStartParam ?? undefined}
        />
      )}
      {workoutType === 'strength' && (
        <StrengthForm />
      )}
    </Layout>
  )
}
