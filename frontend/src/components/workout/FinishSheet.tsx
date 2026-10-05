import type { StrengthFormValues, StrengthScalarField } from '../../lib/strengthSession'
import { EmojiRating } from '../EmojiRating'
import { RPE_OPTIONS, WELLBEING_OPTIONS } from '../emojiRatingOptions'
import { TimeInput } from '../TimeInput'
import { BottomSheet } from './BottomSheet'

/** Finish sheet: session-level fields, then Save (Retry after a failure). */
export function FinishSheet({
  values,
  onField,
  onSave,
  isSaving,
  saveFailed,
  onClose,
}: {
  values: StrengthFormValues
  onField: <K extends StrengthScalarField>(name: K, value: StrengthFormValues[K]) => void
  onSave: () => void
  isSaving: boolean
  saveFailed: boolean
  onClose: () => void
}) {
  const field =
    'mt-1 w-full min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text focus:outline-none focus:border-primary-dark'
  return (
    <BottomSheet
      title="Finish workout"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {saveFailed && (
            <p role="alert" className="text-sm text-error-text">
              Couldn't save the workout. It's still kept on this device — check your connection and retry.
            </p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="w-full min-h-12 rounded-xl bg-primary-dark text-white text-base font-semibold disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : saveFailed ? 'Retry save' : 'Save workout'}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-text-muted-strong">Duration</span>
          <TimeInput
            value={values.duration_seconds}
            onChange={(v) => onField('duration_seconds', v)}
            format="duration"
            placeholder="h:mm:ss"
            className={field}
          />
        </label>
        <EmojiRating
          label="How are you feeling?"
          options={WELLBEING_OPTIONS}
          value={values.wellbeing}
          onChange={(v) => onField('wellbeing', v)}
        />
        <EmojiRating
          label="How hard was that?"
          options={RPE_OPTIONS}
          value={values.rpe}
          onChange={(v) => onField('rpe', v)}
        />
        <label className="block">
          <span className="text-sm font-medium text-text-muted-strong">Session note</span>
          <textarea
            rows={2}
            value={values.notes}
            onChange={(e) => onField('notes', e.target.value)}
            placeholder="Optional notes…"
            className={`${field} py-2 resize-none`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-muted-strong">Calories (kcal, optional)</span>
          <input
            type="text"
            inputMode="numeric"
            value={values.calories}
            onChange={(e) => onField('calories', e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 500"
            className={field}
          />
        </label>
      </div>
    </BottomSheet>
  )
}
