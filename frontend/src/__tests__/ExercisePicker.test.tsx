import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import { StrengthExerciseList } from '../components/StrengthExerciseList'
import type { ExerciseOption } from '../components/ExerciseEntryBlock'
import { emptyEntry } from '../components/exerciseEntryDefaults'

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)

let serverExercises: ExerciseOption[]

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<ExerciseOption[]>('/exercises'),
  })
  const { control, register, setValue, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { exercises: [emptyEntry()] },
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <StrengthExerciseList
        control={control}
        register={register}
        setValue={setValue}
        errors={errors}
        exercises={exercises}
      />
    </form>
  )
}

function renderHarness(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Harness onSubmit={onSubmit} />
    </QueryClientProvider>,
  )
  return onSubmit
}

describe('Exercise picker: create new exercise', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    serverExercises = [{ id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] }]
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/exercises') return [...serverExercises] as never
      if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
      return [] as never
    })
  })

  it('creates from level 1 with empty type_ids and selects the new exercise', async () => {
    const user = userEvent.setup()
    mockPost.mockImplementation(async () => {
      serverExercises = [...serverExercises, { id: 9, name: 'Face Pull', types: [] }]
      return { id: 9, name: 'Face Pull' } as never
    })
    const onSubmit = renderHarness()

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Legs'))
    await user.click(screen.getByRole('button', { name: /all categories/i }))
    await user.click(screen.getByRole('button', { name: '+ New exercise' }))

    const input = screen.getByPlaceholderText('Exercise name')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    await user.type(input, '  Face Pull {Enter}')

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/exercises', { name: 'Face Pull', type_ids: [] }),
    )
    expect(await screen.findByText('Face Pull')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Exercise name')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled() // Enter must not submit the workout form
  })

  it('attaches the category type id when created from inside a typed category', async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ id: 10, name: 'Lunge' } as never)
    renderHarness()

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Legs'))
    await user.click(screen.getByRole('button', { name: '+ New exercise' }))
    await user.type(screen.getByPlaceholderText('Exercise name'), 'Lunge')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/exercises', { name: 'Lunge', type_ids: [7] }),
    )
    // selected name shows even though the mocked list never returned it
    expect((await screen.findAllByText(/Lunge/)).length).toBeGreaterThan(0)
  })

  it('shows the API error inline and keeps the form open', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue(new Error('Exercise already exists'))
    renderHarness()

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Legs'))
    await user.click(screen.getByRole('button', { name: '+ New exercise' }))
    await user.type(screen.getByPlaceholderText('Exercise name'), 'Squat')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Exercise already exists')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Exercise name')).toBeInTheDocument()
  })
})
