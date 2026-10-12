import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the api module so that all useQuery calls return empty arrays/objects
// instead of hitting the network.
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

// Import after mocks
import { api } from '../lib/api'
import { resetRestLength } from '../lib/restLengthSync'
import SettingsPage from '../pages/SettingsPage'

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

// Server-side profile: PATCH merges into it, GET returns it
let profile: Record<string, unknown> = {}

beforeEach(() => {
  resetRestLength()
  localStorage.clear()
  profile = { ai_key_configured: false, rest_seconds: null }
  mockGet.mockReset()
  mockGet.mockImplementation(async (path: string) => (path === '/profile' ? { ...profile } : []) as never)
  mockPatch.mockReset()
  mockPatch.mockImplementation(async (path: string, body: unknown) => {
    if (path === '/profile') profile = { ...profile, ...(body as object) }
    return { ...profile } as never
  })
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsPage — Settings cleanup (plan 6.6)', () => {
  it('does not render any "Manage Data" text or heading', () => {
    renderPage()
    expect(screen.queryByText(/manage data/i)).not.toBeInTheDocument()
  })

  it('does not contain a link to /steps', () => {
    renderPage()
    const stepsLinks = screen
      .queryAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/steps')
    expect(stepsLinks).toHaveLength(0)
  })

  it('renders the expected management sections (Activity Types, Exercise Types, Exercises)', () => {
    renderPage()
    expect(screen.getByText(/activity types/i)).toBeInTheDocument()
    expect(screen.getByText(/exercise types/i)).toBeInTheDocument()
    expect(screen.getByText(/exercises/i)).toBeInTheDocument()
  })
})

describe('SettingsPage — Workout: rest timer', () => {
  const restGroup = () => screen.getByRole('group', { name: 'Rest timer' })
  const chip = (label: string) => within(restGroup()).getByRole('button', { name: label })
  const customField = () => screen.getByLabelText('Custom length (seconds)')

  it('comes first and shows the profile value as the pressed chip', async () => {
    profile.rest_seconds = 120
    renderPage()
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Workout')
    await waitFor(() => expect(chip('120s')).toHaveAttribute('aria-pressed', 'true'))
    expect(chip('90s')).toHaveAttribute('aria-pressed', 'false')
    expect(customField()).toHaveValue('120')
  })

  it('shows a non-preset profile value in the field, with no chip pressed', async () => {
    profile.rest_seconds = 135
    renderPage()
    await waitFor(() => expect(customField()).toHaveValue('135'))
    expect(screen.getByText('2:15')).toBeInTheDocument()
    for (const label of ['60s', '90s', '120s', '180s']) expect(chip(label)).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('135')
  })

  it('a chip saves to the profile and the local cache', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(chip('90s')).toHaveAttribute('aria-pressed', 'true'))
    await user.click(chip('60s'))
    expect(mockPatch).toHaveBeenCalledWith('/profile', { rest_seconds: 60 })
    expect(chip('60s')).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('60')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    expect(customField()).toHaveValue('60')
    expect(profile.rest_seconds).toBe(60)
  })

  it('saves a custom length typed in seconds or m:ss', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(customField()).toHaveValue('90'))
    await user.clear(customField())
    await user.type(customField(), '45')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 45 })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))

    await user.clear(customField())
    await user.type(customField(), '2:15{Enter}')
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 135 })
    await waitFor(() => expect(customField()).toHaveValue('135'))
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('135')
  })

  it.each(['7', '92', '605', 'abc', ''])('rejects %j inline without saving', async (typed) => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(customField()).toHaveValue('90'))
    await user.clear(customField())
    if (typed) await user.type(customField(), typed)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter 15–600 seconds, in steps of 5.')
    expect(customField()).toHaveAttribute('aria-invalid', 'true')
    expect(mockPatch).not.toHaveBeenCalled()

    // Typing again clears the error
    await user.type(customField(), '5')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the API error when the save is refused', async () => {
    const user = userEvent.setup()
    mockPatch.mockRejectedValueOnce(
      Object.assign(new Error('rest_seconds: Value error, out of range'), { status: 422 }) as never,
    )
    renderPage()
    await waitFor(() => expect(chip('90s')).toHaveAttribute('aria-pressed', 'true'))
    await user.click(chip('180s'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the rest timer: rest_seconds: Value error, out of range.",
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says when the server cannot be reached', async () => {
    const user = userEvent.setup()
    mockPatch.mockRejectedValueOnce(new TypeError('Failed to fetch') as never)
    renderPage()
    await waitFor(() => expect(chip('90s')).toHaveAttribute('aria-pressed', 'true'))
    await user.click(chip('60s'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach the server/)
    // Tied to the field, and the pick still holds on this device
    expect(customField()).toHaveAccessibleDescription(/Couldn't reach the server/)
    expect(chip('60s')).toHaveAttribute('aria-pressed', 'true')
  })

  it('editing the field clears a stale save error; one alert at a time', async () => {
    const user = userEvent.setup()
    mockPatch.mockRejectedValueOnce(new TypeError('Failed to fetch') as never)
    renderPage()
    await waitFor(() => expect(chip('90s')).toHaveAttribute('aria-pressed', 'true'))
    await user.click(chip('60s'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't reach the server/)

    await user.clear(customField())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(customField()).toHaveAccessibleDescription('15–600 seconds, in steps of 5.')

    await user.type(customField(), '7')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(customField()).toHaveAccessibleDescription('Enter 15–600 seconds, in steps of 5.')
  })

  it('uses the 90s default when the profile has never set it, without saving', async () => {
    renderPage()
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/profile'))
    await waitFor(() => expect(chip('90s')).toHaveAttribute('aria-pressed', 'true'))
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
