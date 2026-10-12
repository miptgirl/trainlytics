/**
 * Rest length sync between this device and the profile, at the hook level.
 * Requests are deferred where the order of responses matters.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import { useRestLength } from '../lib/hooks/useRestLength'
import { resetRestLength } from '../lib/restLengthSync'

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

const KEY = 'trainlytics_rest_seconds'
const UNSYNCED_KEY = 'trainlytics_rest_seconds_unsynced'

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// The fake server's profile: GET returns it, PATCH merges into it
let server: { rest_seconds: number | null; [field: string]: unknown }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The next PATCH waits: `land()` applies it on the server and answers (with `response` if given). */
function holdPatch() {
  const d = deferred()
  let body: object = {}
  mockPatch.mockImplementationOnce((_path: string, b: unknown) => {
    body = b as object
    return d.promise as never
  })
  return {
    land: (response?: object) => {
      server = { ...server, ...body }
      d.resolve(response ?? { ...server })
    },
    fail: (err: unknown) => d.reject(err),
  }
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

/** Refetches the profile and lets observers and effects see the result (notifications are batched to a later tick). */
async function refetchProfile(qc: QueryClient) {
  await act(async () => {
    await qc.refetchQueries({ queryKey: ['profile'] })
    await new Promise((r) => setTimeout(r, 20))
  })
}

/** Waits until the profile is cached and the hook has reconciled with it. */
async function profileLoaded(qc: QueryClient) {
  await waitFor(() => expect(qc.getQueryData(['profile'])).toBeDefined())
  await act(() => sleep(20))
}

function mount(qc = newClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, ...renderHook(() => useRestLength(), { wrapper }) }
}

beforeEach(() => {
  resetRestLength()
  localStorage.clear()
  server = { rest_seconds: null }
  mockGet.mockReset()
  mockPatch.mockReset()
  mockGet.mockImplementation(async () => ({ ...server }) as never)
  mockPatch.mockImplementation(async (_path: string, body: unknown) => {
    server = { ...server, ...(body as object) }
    return { ...server } as never
  })
})

describe('useRestLength: picks vs. the profile', () => {
  it('a slow first GET (90) landing after a saved pick of 180 is dropped', async () => {
    server.rest_seconds = 90
    const get = deferred()
    mockGet.mockImplementationOnce(() => get.promise as never)
    const { result, qc } = mount()

    act(() => result.current.chooseRestLength(180))
    expect(result.current.restLength).toBe(180)
    await waitFor(() => expect(result.current.unsynced).toBe(false))
    // The GET read the profile before the save
    await act(async () => get.resolve({ rest_seconds: 90 }))

    expect(result.current.restLength).toBe(180)
    expect(localStorage.getItem(KEY)).toBe('180')
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180 })
  })

  it('a slow first GET (90) landing while the save of 180 is in flight is not adopted', async () => {
    server.rest_seconds = 90
    const get = deferred()
    mockGet.mockImplementationOnce(() => get.promise as never)
    const patch = holdPatch()
    const { result, qc } = mount()

    act(() => result.current.chooseRestLength(180))
    await act(async () => get.resolve({ rest_seconds: 90 }))
    expect(result.current.restLength).toBe(180)
    expect(result.current.saving).toBe(true)

    await act(async () => patch.land())
    await waitFor(() => expect(result.current.unsynced).toBe(false))
    await act(() => sleep(20))
    expect(result.current.restLength).toBe(180)
    expect(localStorage.getItem(KEY)).toBe('180')
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180 })
  })

  it('a failed save keeps the pick; the next mount keeps it over the server value and retries', async () => {
    server.rest_seconds = 90
    const first = mount()
    await profileLoaded(first.qc)
    mockPatch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    act(() => first.result.current.chooseRestLength(180))
    await waitFor(() => expect(first.result.current.saveError).toBeInstanceOf(TypeError))
    expect(first.result.current.restLength).toBe(180)
    expect(first.result.current.unsynced).toBe(true)
    expect(localStorage.getItem(UNSYNCED_KEY)).toBe('1')
    first.unmount()

    // Reload: the server still says 90
    const second = mount()
    expect(second.result.current.restLength).toBe(180)
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2))
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 180 })
    await waitFor(() => expect(second.result.current.unsynced).toBe(false))
    expect(second.result.current.restLength).toBe(180)
    expect(server.rest_seconds).toBe(180)
  })

  it('retries an unsynced pick once per mount, not on every profile update', async () => {
    server.rest_seconds = 90
    localStorage.setItem(KEY, '180')
    localStorage.setItem(UNSYNCED_KEY, '1')
    mockPatch.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result, qc } = mount()
    await waitFor(() => expect(result.current.saveError).toBeInstanceOf(TypeError))
    expect(mockPatch).toHaveBeenCalledTimes(1)

    server.rest_seconds = 120
    await refetchProfile(qc)
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 120 })
    expect(mockPatch).toHaveBeenCalledTimes(1)
    // Still the unsynced pick, not the server's new value
    expect(result.current.restLength).toBe(180)

    // The next pick tries again
    act(() => result.current.chooseRestLength(60))
    expect(mockPatch).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(result.current.restLength).toBe(60)
  })

  it('rapid picks 60 then 180: one save at a time, and the profile ends on 180', async () => {
    server.rest_seconds = 90
    const { result, qc } = mount()
    await profileLoaded(qc)
    const first = holdPatch()
    const second = holdPatch()

    act(() => result.current.chooseRestLength(60))
    act(() => result.current.chooseRestLength(180))
    expect(result.current.restLength).toBe(180)
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 60 })

    // The 60 response doesn't win over the newer pick; 180 goes out next
    await act(async () => first.land())
    expect(result.current.restLength).toBe(180)
    expect(result.current.unsynced).toBe(true)
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2))
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 180 })

    await act(async () => second.land())
    await waitFor(() => expect(result.current.unsynced).toBe(false))
    await act(() => sleep(20))
    expect(result.current.restLength).toBe(180)
    expect(localStorage.getItem(KEY)).toBe('180')
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180 })
  })

  it('after a saved pick, a failed refetch or an offline reload keeps 180, not 90', async () => {
    server.rest_seconds = 90
    const first = mount()
    await profileLoaded(first.qc)
    // The save goes through, then the connection drops: the refetch after it fails
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'))
    act(() => first.result.current.chooseRestLength(180))
    await waitFor(() => expect(first.result.current.unsynced).toBe(false))
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    await act(() => sleep(20))
    expect(first.qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180 })
    expect(first.result.current.restLength).toBe(180)
    first.unmount()

    // Same app, the refetch on mount fails
    const again = mount(first.qc)
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3))
    await act(() => sleep(20))
    expect(again.result.current.restLength).toBe(180)
    again.unmount()

    // Fresh page, offline
    const fresh = mount()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4))
    expect(fresh.result.current.restLength).toBe(180)
    expect(mockPatch).toHaveBeenCalledTimes(1)
  })

  it('a failed save with a newer pick waiting sends the newer one, once', async () => {
    server.rest_seconds = 90
    const { result, qc } = mount()
    await profileLoaded(qc)
    const first = holdPatch()
    act(() => result.current.chooseRestLength(60))
    act(() => result.current.chooseRestLength(180))
    expect(mockPatch).toHaveBeenCalledTimes(1)

    // Both fail; the second failure has no newer pick behind it
    mockPatch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => first.fail(new TypeError('Failed to fetch')))
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2))
    expect(mockPatch).toHaveBeenLastCalledWith('/profile', { rest_seconds: 180 })
    await waitFor(() => expect(result.current.saveError).toBeInstanceOf(TypeError))
    await act(() => sleep(50))
    expect(mockPatch).toHaveBeenCalledTimes(2)
    expect(result.current.unsynced).toBe(true)
    expect(result.current.restLength).toBe(180)
  })

  it('a save changes only rest_seconds in the cached profile, then refetches', async () => {
    server = { rest_seconds: 90, display_name: 'Old' }
    const { result, qc } = mount()
    await waitFor(() => expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 90, display_name: 'Old' }))
    const patch = holdPatch()
    act(() => result.current.chooseRestLength(180))

    // Another section saves the name meanwhile and caches its answer
    server.display_name = 'New'
    act(() => qc.setQueryData(['profile'], (old: object) => ({ ...old, display_name: 'New' })))
    const refetch = deferred()
    mockGet.mockImplementationOnce(() => refetch.promise as never)
    // The rest save answers with a snapshot from before the name change
    await act(async () => patch.land({ rest_seconds: 180, display_name: 'Old' }))

    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180, display_name: 'New' })
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    await act(async () => refetch.resolve({ ...server }))
    await act(() => sleep(20))
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: 180, display_name: 'New' })
    expect(result.current.restLength).toBe(180)
  })

  it('with storage that takes reads but not writes, a pick still holds and is saved', async () => {
    localStorage.setItem(KEY, '90')
    server.rest_seconds = 90
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    try {
      const { result } = mount()
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
      const patch = holdPatch()
      act(() => result.current.chooseRestLength(180))
      expect(result.current.restLength).toBe(180)
      expect(result.current.unsynced).toBe(true)
      expect(mockPatch).toHaveBeenCalledWith('/profile', { rest_seconds: 180 })

      await act(async () => patch.land())
      await waitFor(() => expect(result.current.unsynced).toBe(false))
      await act(() => sleep(20))
      expect(result.current.restLength).toBe(180)
      expect(localStorage.getItem(KEY)).toBe('90')
    } finally {
      setItem.mockRestore()
    }
  })

  it('follows a pick made in another tab', async () => {
    server.rest_seconds = 90
    const { result, qc } = mount()
    await profileLoaded(qc)

    // The other tab writes storage; this one only hears the storage event
    localStorage.setItem(KEY, '150')
    localStorage.setItem(UNSYNCED_KEY, '1')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '150' })))
    expect(result.current.restLength).toBe(150)
    expect(result.current.unsynced).toBe(true)

    // Its save lands
    localStorage.removeItem(UNSYNCED_KEY)
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: UNSYNCED_KEY, newValue: null })))
    expect(result.current.unsynced).toBe(false)
    expect(result.current.restLength).toBe(150)
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('adopts a value set on another device when nothing here is unsynced', async () => {
    localStorage.setItem(KEY, '90')
    server.rest_seconds = 150
    const { result, qc } = mount()
    await waitFor(() => expect(result.current.restLength).toBe(150))
    expect(localStorage.getItem(KEY)).toBe('150')

    server.rest_seconds = 45
    await refetchProfile(qc)
    expect(result.current.restLength).toBe(45)
    expect(localStorage.getItem(KEY)).toBe('45')
    expect(mockPatch).not.toHaveBeenCalled()
  })
})

describe('useRestLength: profile never set (null)', () => {
  it('uploads a length stored here before profile sync', async () => {
    localStorage.setItem(KEY, '180')
    const { result } = mount()
    expect(result.current.restLength).toBe(180)
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/profile', { rest_seconds: 180 }))
    await waitFor(() => expect(result.current.unsynced).toBe(false))
    expect(result.current.restLength).toBe(180)
    expect(server.rest_seconds).toBe(180)
  })

  it('uploads it once per mount, even if the server keeps answering null', async () => {
    localStorage.setItem(KEY, '180')
    // A server that accepts the save but still reports null
    mockPatch.mockImplementation(async () => ({ rest_seconds: null }) as never)
    const { result, qc } = mount()
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))
    await refetchProfile(qc)
    await refetchProfile(qc)
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(result.current.restLength).toBe(180)
  })

  it('with nothing stored, uses the 90s default and saves nothing', async () => {
    const { result } = mount()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(result.current.restLength).toBe(90)
    expect(mockPatch).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('resetRestLength (logout)', () => {
  it('forgets the stored length, and a save still in flight lands nowhere', async () => {
    const patch = deferred()
    mockPatch.mockImplementationOnce(() => patch.promise as never)
    const { result, qc } = mount()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
    act(() => result.current.chooseRestLength(180))

    act(() => resetRestLength())
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(UNSYNCED_KEY)).toBeNull()
    expect(result.current.restLength).toBe(90)

    await act(async () => patch.resolve({ rest_seconds: 180 }))
    expect(result.current.restLength).toBe(90)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(qc.getQueryData(['profile'])).toEqual({ rest_seconds: null })
  })
})
