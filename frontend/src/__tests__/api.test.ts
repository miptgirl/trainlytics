import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setToken, setUnauthorizedHandler } from '../lib/api'

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function bearer(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>)['Authorization']
}

describe('api 401 handling', () => {
  const fetchMock = vi.fn()
  const onUnauthorized = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    onUnauthorized.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setToken('old-token')
    setUnauthorizedHandler(onUnauthorized)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockRefreshSucceeds() {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/auth/refresh') return json(200, { access_token: 'new-token' })
      return bearer(init) === 'Bearer new-token' ? json(200, { ok: true }) : json(401)
    })
  }

  it('refreshes on 401 and retries with the new token', async () => {
    mockRefreshSucceeds()

    await expect(api.get('/exercises')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(refreshUrl).toBe('/api/auth/refresh')
    expect(refreshInit.method).toBe('POST')
    expect(refreshInit.credentials).toBe('include')
    expect(bearer(fetchMock.mock.calls[2][1] as RequestInit)).toBe('Bearer new-token')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('shares one refresh between concurrent 401s', async () => {
    mockRefreshSucceeds()

    await Promise.all([api.get('/a'), api.get('/b')])

    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === '/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
  })

  it('calls the unauthorized handler when refresh fails', async () => {
    fetchMock.mockImplementation(async () => json(401))

    await expect(api.get('/exercises')).rejects.toThrow('Unauthorized')

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('calls the unauthorized handler when the retry also returns 401', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/auth/refresh' ? json(200, { access_token: 'new-token' }) : json(401),
    )

    await expect(api.get('/exercises')).rejects.toThrow('Unauthorized')

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not attempt refresh for a 401 from /auth/login', async () => {
    fetchMock.mockResolvedValue(json(401, { detail: 'Invalid credentials' }))

    await expect(api.post('/auth/login', { username: 'a', password: 'b' })).rejects.toThrow('Unauthorized')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
  })
})

describe('session RPE scale header', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => json(200, { id: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    setToken('token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is sent on every request, so the API accepts a session rpe', async () => {
    await api.post('/sessions/strength', { rpe: 8 })
    await api.patch('/sessions/1', { rpe: 2 })
    await api.get('/sessions')
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)['X-Session-Rpe-Scale']).toBe('10')
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
