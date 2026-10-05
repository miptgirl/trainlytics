import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
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
            { reps: '5', weight: '100', notes: '', done: false },
          ],
        },
      ],
    },
  })
  return (
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

describe('ExerciseEntryBlock set rows', () => {
  it('puts the note and Delete on the second line, away from Done', async () => {
    await renderBlock(true)
    const [row] = screen.getAllByRole('button', { name: 'Remove set' }).map((b) => b.parentElement!)
    const del = within(row).getByRole('button', { name: 'Remove set' })
    const done = within(row).getByLabelText('Mark undone').closest('label')!
    const note = within(row).getByPlaceholderText('note').parentElement!

    // Done on line 1, last column; note + Delete on line 2
    expect(done).toHaveClass('max-sm:row-start-1', 'max-sm:col-start-4')
    expect(note).toHaveClass('max-sm:row-start-2', 'max-sm:col-span-3')
    expect(del).toHaveClass('max-sm:row-start-2', 'max-sm:col-start-4')
  })

  it('tints done rows instead of striking the numbers through on phones', async () => {
    await renderBlock(true)
    const [doneRow] = screen.getAllByRole('button', { name: 'Remove set' }).map((b) => b.parentElement!)
    expect(doneRow).toHaveClass('bg-green-50')
    const reps = within(doneRow).getByPlaceholderText('reps')
    // line-through only applies from sm up
    expect(reps).toHaveClass('sm:line-through')
    expect(reps).not.toHaveClass('line-through')
  })

  it('keeps a layout without the Done column for the template editor', async () => {
    await renderBlock(false)
    expect(screen.queryByLabelText(/mark (un)?done/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove set' })).toHaveLength(2)
  })

  it('adds a set from the full-width button below the last set', async () => {
    await renderBlock(false)
    const addBelow = screen.getByRole('button', { name: '+ Add set' })
    // it comes after the last set row in the DOM
    const lastDelete = screen.getAllByRole('button', { name: 'Remove set' }).at(-1)!
    expect(lastDelete.compareDocumentPosition(addBelow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(addBelow)
    expect(screen.getAllByRole('button', { name: 'Remove set' })).toHaveLength(3)
  })
})
