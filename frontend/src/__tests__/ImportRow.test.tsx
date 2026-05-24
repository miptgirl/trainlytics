import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  }
})

import { api, ApiError } from '../lib/api'
import { ImportRow } from '../components/imports/ImportRow'
import type { PendingImport, CardioType } from '../components/imports/ImportRow'

const mockPost = vi.mocked(api.post)

const CARDIO_TYPES: CardioType[] = [
  { id: 1, name: 'Run' },
  { id: 2, name: 'Cycle' },
]

function makeItem(overrides: Partial<PendingImport> = {}): PendingImport {
  return {
    id: 1,
    source: 'strava',
    status: 'pending',
    mapped_session: {
      type: 'cardio',
      source: 'strava',
      activity_type: 'Run',
      date: '2026-01-10',
      duration_seconds: 3600,
      distance_m: 10000,
      title: 'Morning Run',
    },
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-01-10T08:00:00Z',
    ...overrides,
  }
}

function renderRow(item = makeItem()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={qc}>
      <ImportRow item={item} cardioTypes={CARDIO_TYPES} />
    </QueryClientProvider>,
  )
}

describe('ImportRow', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders Strava source badge', () => {
    renderRow()
    expect(screen.getByText('Strava')).toBeInTheDocument()
  })

  it('renders Apple Health source badge', () => {
    renderRow(makeItem({ source: 'apple_health' }))
    expect(screen.getByText('Apple Health')).toBeInTheDocument()
  })

  it('renders activity type', () => {
    renderRow()
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('renders formatted date', () => {
    renderRow()
    // en-GB locale: "10 Jan 2026"
    expect(screen.getByText(/jan.*2026/i)).toBeInTheDocument()
  })

  it('renders session title', () => {
    renderRow()
    expect(screen.getByText('Morning Run')).toBeInTheDocument()
  })

  it('renders proposed type name when activity_type is null', () => {
    const item = makeItem()
    item.mapped_session = { ...item.mapped_session, activity_type: null, proposed_type_name: 'Snowboard' }
    renderRow(item)
    expect(screen.getByText(/snowboard/i)).toBeInTheDocument()
  })

  // ── Accept flow ────────────────────────────────────────────────────────────

  it('accept button calls api.post with the import id', async () => {
    mockPost.mockResolvedValue({ session_id: 42 })
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/imports/1/accept'))
  })

  it('shows conflict warning when accept returns 409', async () => {
    mockPost.mockRejectedValue(
      new ApiError('Conflict', 409, {
        detail: { conflict: { session_id: 99, date: '2026-01-10', duration: 3600 } },
      }),
    )
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept anyway/i })).toBeInTheDocument()
  })

  it('calls force-accept when Accept anyway is clicked', async () => {
    mockPost
      .mockRejectedValueOnce(
        new ApiError('Conflict', 409, {
          detail: { conflict: { session_id: 99, date: '2026-01-10', duration: 3600 } },
        }),
      )
      .mockResolvedValueOnce({ session_id: 99 })

    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    await screen.findByText(/possible duplicate/i)
    await userEvent.click(screen.getByRole('button', { name: /accept anyway/i }))
    await waitFor(() =>
      expect(mockPost).toHaveBeenLastCalledWith('/imports/1/accept?force=true'),
    )
  })

  // ── Discard flow ───────────────────────────────────────────────────────────

  it('shows confirmation prompt on first discard click', async () => {
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(screen.getByText(/discard this import/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yes, discard/i })).toBeInTheDocument()
  })

  it('calls discard api after confirmation', async () => {
    mockPost.mockResolvedValue({})
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, discard/i }))
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/imports/1/discard'))
  })

  it('cancels discard when cancel is clicked', async () => {
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(screen.getByText(/discard this import/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/discard this import/i)).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
