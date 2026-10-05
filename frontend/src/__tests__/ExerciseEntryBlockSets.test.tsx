import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { ExerciseEntryBlock, type ExerciseEntryFormValues } from '../components/ExerciseEntryBlock'

const exercises = [{ id: 1, name: 'Squat' }]

function Harness({ showDone }: { showDone: boolean }) {
  const { register, control, setValue, formState } = useForm<{ exercises: ExerciseEntryFormValues[] }>({
    defaultValues: {
      exercises: [
        {
          exercise_id: '1',
          sets: [
            { reps: '5', weight: '100', notes: '', done: true },
            { reps: '6', weight: '110', notes: '', done: false },
            { reps: '7', weight: '120', notes: '', done: false },
          ],
        },
      ],
    },
  })
  const sets = useWatch({ control, name: 'exercises.0.sets' })
  return (
    <>
      <ExerciseEntryBlock
        exIndex={0}
        register={register}
        control={control}
        setValue={setValue as never}
        exercises={exercises}
        canRemove={false}
        onRemove={() => {}}
        errors={formState.errors}
        showDone={showDone}
        prefillFromLastSession={false}
      />
      <output data-testid="values">{JSON.stringify(sets)}</output>
    </>
  )
}

async function renderBlock(showDone: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // act so the replacements fetch settles inside the test
  await act(async () => {
    render(
      <QueryClientProvider client={qc}>
        <Harness showDone={showDone} />
      </QueryClientProvider>,
    )
  })
}

const values = () => JSON.parse(screen.getByTestId('values').textContent!) as { reps: string; done: boolean }[]
const rows = () => screen.getAllByRole('button', { name: 'Remove set' }).map((b) => b.parentElement!)
const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('ExerciseEntryBlock set rows', () => {
  it('keeps DOM (tab) order equal to the visual order on phones: reps, weight, done, note, delete', async () => {
    await renderBlock(true)
    const row = rows()[0]
    const reps = within(row).getByPlaceholderText('reps')
    const weight = within(row).getByPlaceholderText('kg')
    const done = within(row).getByLabelText('Mark undone').closest('label')!
    const note = within(row).getByPlaceholderText('note')
    const del = within(row).getByRole('button', { name: 'Remove set' })
    expect(follows(reps, weight)).toBe(true)
    expect(follows(weight, done)).toBe(true)
    expect(follows(done, note)).toBe(true)
    expect(follows(note, del)).toBe(true)
  })

  it('toggling Done updates the form value and tints the row', async () => {
    const user = userEvent.setup()
    await renderBlock(true)
    expect(values().map((v) => v.done)).toEqual([true, false, false])
    expect(rows()[0]).toHaveClass('bg-green-50')
    expect(rows()[1]).not.toHaveClass('bg-green-50')

    await user.click(within(rows()[1]).getByLabelText('Mark done'))
    expect(values().map((v) => v.done)).toEqual([true, true, false])
    expect(rows()[1]).toHaveClass('bg-green-50')

    await user.click(within(rows()[0]).getByLabelText('Mark undone'))
    expect(values()[0].done).toBe(false)
    expect(rows()[0]).not.toHaveClass('bg-green-50')
  })

  it('does not strike numbers through on phones', async () => {
    await renderBlock(true)
    const reps = within(rows()[0]).getByPlaceholderText('reps')
    expect(reps).toHaveClass('sm:line-through')
    expect(reps).not.toHaveClass('line-through')
  })

  it('removes exactly the set whose Delete was pressed', async () => {
    const user = userEvent.setup()
    await renderBlock(true)
    await user.click(within(rows()[1]).getByRole('button', { name: 'Remove set' }))
    expect(values().map((v) => v.reps)).toEqual(['5', '7'])
  })

  it('has no Done control in the template editor layout', async () => {
    await renderBlock(false)
    expect(screen.queryByLabelText(/mark (un)?done/i)).not.toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    // Weight takes the column Done would use, so line 1 has no empty gap
    expect(within(rows()[0]).getByPlaceholderText('kg')).toHaveClass('max-sm:col-span-2')
  })

  it('adds a set from the full-width button below the last set', async () => {
    await renderBlock(false)
    const addBelow = screen.getByRole('button', { name: '+ Add set' })
    expect(follows(rows().at(-1)!, addBelow)).toBe(true)
    await userEvent.click(addBelow)
    expect(rows()).toHaveLength(4)
  })
})
