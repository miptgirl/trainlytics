import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import { ExerciseEntryBlock, type ExerciseEntryFormValues } from '../components/ExerciseEntryBlock'

const exercises = [{ id: 1, name: 'Squat' }]

function Harness({ showDone, showRpe }: { showDone: boolean; showRpe: boolean }) {
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
        showRpe={showRpe}
        prefillFromLastSession={false}
      />
      <output data-testid="values">{JSON.stringify(sets)}</output>
    </>
  )
}

async function renderBlock(showDone: boolean, showRpe = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // act so the replacements fetch settles inside the test
  await act(async () => {
    render(
      <QueryClientProvider client={qc}>
        <Harness showDone={showDone} showRpe={showRpe} />
      </QueryClientProvider>,
    )
  })
}

const values = () => JSON.parse(screen.getByTestId('values').textContent!) as { reps: string; done: boolean; rpe?: string }[]
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
    expect(rows()[0]).toHaveClass('bg-success/10')
    expect(rows()[1]).not.toHaveClass('bg-success/10')

    await user.click(within(rows()[1]).getByLabelText('Mark done'))
    expect(values().map((v) => v.done)).toEqual([true, true, false])
    expect(rows()[1]).toHaveClass('bg-success/10')

    await user.click(within(rows()[0]).getByLabelText('Mark undone'))
    expect(values()[0].done).toBe(false)
    expect(rows()[0]).not.toHaveClass('bg-success/10')
  })

  it('does not strike numbers through on phones', async () => {
    await renderBlock(true)
    const reps = within(rows()[0]).getByPlaceholderText('reps')
    expect(reps).toHaveClass('sm:line-through')
    expect(reps).not.toHaveClass('line-through')
  })

  it('strikes a done set\'s RPE through from sm up only, like reps and weight', async () => {
    await renderBlock(true, true)
    const rpe = within(rows()[0]).getByLabelText('RPE for set 1')
    expect(rpe).toHaveClass('sm:line-through')
    expect(rpe).not.toHaveClass('line-through')
    expect(within(rows()[1]).getByLabelText('RPE for set 2')).not.toHaveClass('sm:line-through')
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

  it('shows an RPE input after Weight only when showRpe is set, on line 2 after Note on phones', async () => {
    const user = userEvent.setup()
    await renderBlock(true, true)
    const row = rows()[1]
    const rpe = within(row).getByLabelText('RPE for set 2')
    // Visible on phones: line 2 is Note(span 2) RPE Delete via order classes
    expect(rpe).not.toHaveClass('max-sm:hidden')
    expect(rpe.parentElement).toHaveClass('max-sm:order-2')
    expect(within(row).getByPlaceholderText('note').parentElement).toHaveClass('max-sm:col-span-2', 'max-sm:order-1')
    expect(within(row).getByRole('button', { name: 'Remove set' })).toHaveClass('max-sm:order-3')
    // DOM order stays reps, weight, rpe, done, note, delete
    expect(follows(rpe, within(row).getByLabelText('Mark done').closest('label')!)).toBe(true)
    // The header cell stays hidden on phones; the field carries its own phone-only "RPE" prefix instead
    const header = screen.getAllByText('RPE').find((el) => el.classList.contains('max-sm:hidden'))
    expect(header).toBeDefined()
    expect(within(row).getByText('RPE')).toHaveClass('sm:hidden')
    expect(rpe).toHaveAttribute('inputmode', 'numeric')
    expect(follows(within(row).getByPlaceholderText('kg'), rpe)).toBe(true)
    await user.type(rpe, '8')
    expect(values()[1].rpe).toBe('8')
  })

  it('has no RPE column in the template editor layout', async () => {
    await renderBlock(false)
    expect(screen.queryByLabelText(/RPE for set/)).not.toBeInTheDocument()
    expect(screen.queryByText('RPE')).not.toBeInTheDocument()
    // Without RPE the note keeps the full width of line 2 before Delete
    expect(within(rows()[0]).getByPlaceholderText('note').parentElement).toHaveClass('max-sm:col-span-3')
  })

  it('adds a set from the full-width button below the last set', async () => {
    await renderBlock(false)
    const addBelow = screen.getByRole('button', { name: '+ Add set' })
    expect(follows(rows().at(-1)!, addBelow)).toBe(true)
    await userEvent.click(addBelow)
    expect(rows()).toHaveLength(4)
  })
})

// ── Timed sets ───────────────────────────────────────────────────────────────

const library = [
  { id: 1, name: 'Squat', measure: 'reps' as const },
  { id: 7, name: 'Plank', measure: 'time' as const },
]

type TimedSet = { reps: string; duration: string; weight: string; notes: string; rpe: string; done: boolean }
const tset = (reps: string, duration: string, weight = '', done = false): TimedSet => ({
  reps,
  duration,
  weight,
  notes: '',
  rpe: '',
  done,
})

function TimedHarness({ exerciseId, sets, prefill }: { exerciseId: string; sets: TimedSet[]; prefill: boolean }) {
  const { register, control, setValue, formState } = useForm<{ exercises: ExerciseEntryFormValues[] }>({
    defaultValues: { exercises: [{ exercise_id: exerciseId, sets }] },
  })
  const watched = useWatch({ control, name: 'exercises.0.sets' })
  return (
    <>
      <ExerciseEntryBlock
        exIndex={0}
        register={register}
        control={control}
        setValue={setValue as never}
        exercises={library}
        canRemove={false}
        onRemove={() => {}}
        errors={formState.errors}
        showDone
        showRpe
        prefillFromLastSession={prefill}
      />
      <output data-testid="values">{JSON.stringify(watched)}</output>
    </>
  )
}

async function renderTimed(exerciseId: string, sets: TimedSet[], prefill = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    render(
      <QueryClientProvider client={qc}>
        <TimedHarness exerciseId={exerciseId} sets={sets} prefill={prefill} />
      </QueryClientProvider>,
    )
  })
}

const timedValues = () => JSON.parse(screen.getByTestId('values').textContent!) as TimedSet[]

describe('ExerciseEntryBlock timed sets', () => {
  it('a timed exercise shows a Time (s) column with a numeric text input instead of Reps', async () => {
    const user = userEvent.setup()
    await renderTimed('7', [tset('', '45'), tset('', '')])
    expect(screen.getByText('Time (s)')).toBeInTheDocument()
    expect(screen.queryByText('Reps')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('reps')).not.toBeInTheDocument()
    const first = screen.getByLabelText('Time in seconds for set 1')
    expect(first).toHaveValue('45')
    expect(first).toHaveAttribute('inputmode', 'numeric')
    const second = screen.getByLabelText('Time in seconds for set 2')
    await user.type(second, '1:30')
    expect(timedValues()[1]).toEqual(tset('', '1:30'))
  })

  it('a reps exercise keeps the Reps column', async () => {
    await renderTimed('1', [tset('5', '', '100')])
    expect(screen.getByText('Reps')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Time in seconds/)).not.toBeInTheDocument()
  })

  it('a set logged as timed shows its time after the exercise went back to reps; cleared, it follows the exercise', async () => {
    const user = userEvent.setup()
    await renderTimed('1', [tset('', '45'), tset('8', '', '60')])
    expect(screen.getByText('Reps / time')).toBeInTheDocument()
    const time = screen.getByLabelText('Time in seconds for set 1')
    expect(time).toHaveValue('45')
    // Replacing the value keeps it a time
    await user.type(time, '50', { initialSelectionStart: 0, initialSelectionEnd: 2 })
    expect(timedValues()[0]).toEqual(tset('', '50'))
    // Cleared, the set has no value and takes the exercise's kind: Reps, in the same (still focused) input
    await user.clear(time)
    const reps = within(rows()[0]).getByPlaceholderText('reps')
    expect(reps).toBe(time)
    expect(reps).toHaveFocus()
    expect(screen.getByText('Reps')).toBeInTheDocument()
    await user.type(reps, '8')
    expect(timedValues()[0]).toEqual(tset('8', ''))
  })

  it('a timed exercise\'s set holding reps shows Reps; cleared, it flips to Time with the header', async () => {
    const user = userEvent.setup()
    await renderTimed('7', [tset('60', '')])
    expect(screen.getByText('Reps')).toBeInTheDocument()
    const reps = screen.getByPlaceholderText('reps')
    await user.clear(reps)
    const time = screen.getByLabelText('Time in seconds for set 1')
    expect(time).toBe(reps)
    expect(time).toHaveFocus()
    expect(screen.getByText('Time (s)')).toBeInTheDocument()
    await user.type(time, '45')
    expect(timedValues()[0]).toEqual(tset('', '45'))
  })

  it('ignores a keystroke or paste that is not digits and ":"', async () => {
    const user = userEvent.setup()
    await renderTimed('7', [tset('', '45')])
    const time = screen.getByLabelText('Time in seconds for set 1')
    await user.type(time, '.')
    expect(time).toHaveValue('45')
    expect(timedValues()[0]).toEqual(tset('', '45'))
    await user.clear(time)
    await user.paste('-5')
    expect(time).toHaveValue('')
    await user.paste('45.5')
    expect(time).toHaveValue('')
    await user.paste('1:30')
    expect(timedValues()[0]).toEqual(tset('', '1:30'))
  })

  it('prefills a timed exercise\'s times from last session when it is picked', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/exercises/7/last-session-defaults') {
        return {
          sets: [
            { set_number: 1, reps: null, weight: null, duration_seconds: 45 },
            { set_number: 2, reps: null, weight: 10, duration_seconds: 60 },
          ],
        } as never
      }
      return [] as never
    })
    try {
      await renderTimed('1', [tset('5', '', '100')], true)
      await user.click(screen.getByRole('button', { name: 'Squat' }))
      await user.click(screen.getByRole('button', { name: 'Plank' }))
      expect(await screen.findByLabelText('Time in seconds for set 2')).toHaveValue('60')
      expect(screen.getByLabelText('Time in seconds for set 1')).toHaveValue('45')
      expect(screen.getByText('Filled from last session')).toBeInTheDocument()
      expect(timedValues()).toEqual([tset('', '45'), tset('', '60', '10')])
    } finally {
      vi.mocked(api.get).mockResolvedValue([] as never)
    }
  })

  it('picking an exercise of the other measure clears reps and keeps weight and done', async () => {
    const user = userEvent.setup()
    await renderTimed('1', [tset('5', '', '100', true), tset('6', '', '100')])
    // The picker opens on the current exercise's group
    await user.click(screen.getByRole('button', { name: 'Squat' }))
    await user.click(screen.getByRole('button', { name: 'Plank' }))
    expect(timedValues()).toEqual([tset('', '', '100', true), tset('', '', '100')])
    expect(screen.getByText('Time (s)')).toBeInTheDocument()
    expect(screen.getByLabelText('Time in seconds for set 1')).toHaveValue('')
  })
})
