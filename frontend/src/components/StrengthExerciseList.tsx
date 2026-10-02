import { useState } from 'react'
import { useFieldArray } from 'react-hook-form'
import { ExerciseEntryBlock, type ExerciseOption } from './ExerciseEntryBlock'
import { emptyEntry } from './exerciseEntryDefaults'

/**
 * Shared strength exercise list: heading, collapsible exercise blocks and the
 * "+ Add Exercise" button below the last block. Expects the form to have an
 * `exercises` field array of ExerciseEntryFormValues.
 */
export function StrengthExerciseList({
  control,
  register,
  setValue,
  errors,
  exercises,
  showDone = false,
  prefillFromLastSession = true,
}: {
  control: any
  register: any
  setValue?: (name: any, value: any) => void
  errors: any
  exercises: ExerciseOption[]
  showDone?: boolean
  prefillFromLastSession?: boolean
}) {
  const [collapsedExercises, setCollapsedExercises] = useState<Set<number>>(new Set())
  const {
    fields: exerciseFields,
    append: appendExercise,
    remove: removeExercise,
  } = useFieldArray({ control, name: 'exercises' })

  return (
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
            setValue={setValue}
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
            showDone={showDone}
            prefillFromLastSession={prefillFromLastSession}
            isCollapsed={collapsedExercises.has(exIndex)}
            onToggleCollapse={() =>
              setCollapsedExercises((prev) => {
                const next = new Set(prev)
                if (next.has(exIndex)) next.delete(exIndex)
                else next.add(exIndex)
                return next
              })
            }
            onAutoCollapse={() => setCollapsedExercises((prev) => new Set(prev).add(exIndex))}
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
  )
}
