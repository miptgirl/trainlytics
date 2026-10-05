import { act, render, renderHook, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { RestTimer } from '../components/workout/RestTimer'
import { useWakeLock } from '../lib/hooks/useWakeLock'
import {
  DEFAULT_REST_SECONDS,
  allExercisesDone,
  exerciseAfterCompletion,
  formatClock,
  formatLastTime,
  formatSet,
  isBlankEntry,
  loadRestLength,
  newExerciseSets,
  nextUnfinishedIndex,
  prefersWorkoutMode,
  restRemaining,
  sanitizeDecimal,
  saveErrorMessage,
  saveRestLength,
  sessionProgress,
  stepValue,
} from '../lib/workoutMode'

const set = (reps: string, weight: string, done = false, notes = '') => ({ reps, weight, notes, done })
const ex = (id: string, ...sets: ReturnType<typeof set>[]) => ({ exercise_id: id, sets })

describe('progress and navigation', () => {
  const list = [
    ex('1', set('5', '100', true), set('5', '100', true)),
    ex('2', set('8', '60', true), set('8', '60')),
    ex('3', set('10', '20')),
  ]

  it('counts done sets and exercises', () => {
    expect(sessionProgress(list)).toEqual({ doneSets: 3, totalSets: 5, doneExercises: 1, totalExercises: 3 })
  })

  it('finds the next unfinished exercise, wrapping around', () => {
    expect(nextUnfinishedIndex(list, 0)).toBe(1)
    expect(nextUnfinishedIndex(list, 1)).toBe(2)
    expect(nextUnfinishedIndex(list, 2)).toBe(1)
    expect(nextUnfinishedIndex([list[0], list[0]], 0)).toBe(-1)
  })

  it('stays on an exercise with sets left and advances when it is finished', () => {
    expect(exerciseAfterCompletion(list, 1)).toBe(1)
    expect(exerciseAfterCompletion(list, 0)).toBe(1)
    const finished = [list[0], ex('2', set('8', '60', true))]
    expect(exerciseAfterCompletion(finished, 1)).toBe(1)
    expect(allExercisesDone(finished)).toBe(true)
  })

  it('recognises an untouched placeholder entry', () => {
    expect(isBlankEntry(ex('', set('', '')))).toBe(true)
    expect(isBlankEntry(ex('', set('5', '')))).toBe(false)
    expect(isBlankEntry(ex('4', set('', '')))).toBe(false)
  })

  it('new exercises get three sets with reps and weight from last session', () => {
    expect(newExerciseSets(null)).toEqual([set('', ''), set('', ''), set('', '')])
    expect(
      newExerciseSets({ sets: [{ set_number: 1, reps: 8, weight: 60 }, { set_number: 2, reps: 6, weight: 62.5 }] }),
    ).toEqual([set('8', '60'), set('6', '62.5'), set('6', '62.5')])
    expect(newExerciseSets({ sets: [{ set_number: 1, reps: 10, weight: null }] })).toEqual([
      set('10', ''),
      set('10', ''),
      set('10', ''),
    ])
  })
})

describe('formatting and steppers', () => {
  it('summarises last session', () => {
    const s = (reps: number | null, weight: number | null) => ({ set_number: 1, reps, weight })
    expect(formatLastTime({ sets: [s(8, 57.5), s(8, 57.5), s(8, 57.5), s(8, 57.5)] })).toBe('4 × 8 @ 57.5 kg')
    expect(formatLastTime({ sets: [s(12, null), s(12, null)] })).toBe('2 × 12')
    expect(formatLastTime({ sets: [s(8, 60), s(6, 65)] })).toBe('8×60, 6×65 kg')
    expect(formatLastTime({ sets: [] })).toBeNull()
    expect(formatLastTime(undefined)).toBeNull()
  })

  it('formats one set', () => {
    expect(formatSet(set('6', '100'))).toBe('6 × 100 kg')
    expect(formatSet(set('12', ''))).toBe('12 reps')
  })

  it('steps reps by 1 and weight by 2.5 without going below zero or float noise', () => {
    expect(stepValue('', 1)).toBe('1')
    expect(stepValue('0', -1)).toBe('0')
    expect(stepValue('55', 2.5)).toBe('57.5')
    expect(stepValue('0.1', 0.2)).toBe('0.3')
    expect(stepValue('1', -2.5)).toBe('0')
  })

  it('formats the clock', () => {
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(5)).toBe('0:05')
    expect(restRemaining(10_500, 10_000)).toBe(1)
    expect(restRemaining(9_000, 10_000)).toBe(0)
  })
})

describe('input sanitising and save errors', () => {
  it('keeps weights a valid decimal', () => {
    expect(sanitizeDecimal('97,5')).toBe('97.5')
    expect(sanitizeDecimal('2.5.5')).toBe('2.55')
    expect(sanitizeDecimal('.')).toBe('0.')
    expect(sanitizeDecimal('1a2')).toBe('12')
  })

  it('says "connection" only for network errors', () => {
    expect(saveErrorMessage(new TypeError('Failed to fetch'))).toMatch(/check your connection/)
    const e422 = Object.assign(new Error('Invalid set'), { status: 422 })
    expect(saveErrorMessage(e422)).toBe("Couldn't save the workout: Invalid set. It's still kept on this device.")
    expect(saveErrorMessage(Object.assign(new Error('x'), { status: 503 }))).toMatch(/error 503/)
  })
})

describe('rest length setting', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 90s and keeps a valid choice', () => {
    expect(loadRestLength()).toBe(DEFAULT_REST_SECONDS)
    saveRestLength(120)
    expect(loadRestLength()).toBe(120)
    localStorage.setItem('trainlytics_rest_seconds', '45')
    expect(loadRestLength()).toBe(DEFAULT_REST_SECONDS)
  })
})

describe('prefersWorkoutMode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('follows the 767px media query', () => {
    const mm = vi.fn((q: string) => ({ matches: q === '(max-width: 767px)' }))
    vi.stubGlobal('matchMedia', mm)
    expect(prefersWorkoutMode()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersWorkoutMode()).toBe(false)
  })
})

describe('RestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const noop = () => {}

  it('counts down from the stored end time and vibrates once at zero', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    render(<RestTimer endsAt={Date.now() + 90_000} lengthSeconds={90} onReset={noop} onAddThirty={noop} onSkip={noop} />)
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('1:30')

    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('1:00')

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('0:00')
    expect(screen.getByText('Rest done')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(10_000))
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('shows the remaining time after a reload and does not vibrate for an old timer', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    const { unmount } = render(
      <RestTimer endsAt={Date.now() + 45_000} lengthSeconds={90} onReset={noop} onAddThirty={noop} onSkip={noop} />,
    )
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('0:45')
    unmount()

    render(<RestTimer endsAt={Date.now() - 5_000} lengthSeconds={90} onReset={noop} onAddThirty={noop} onSkip={noop} />)
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('0:00')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('Reset after expiry shows the new time at once, not a stale value', () => {
    const { rerender } = render(
      <RestTimer endsAt={Date.now() + 1_000} lengthSeconds={90} onReset={noop} onAddThirty={noop} onSkip={noop} />,
    )
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('0:00')
    rerender(<RestTimer endsAt={Date.now() + 30_000} lengthSeconds={90} onReset={noop} onAddThirty={noop} onSkip={noop} />)
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('0:30')
  })

  it('shows the configured length when idle', () => {
    render(<RestTimer endsAt={null} lengthSeconds={120} onReset={noop} onAddThirty={noop} onSkip={noop} />)
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('2:00')
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeDisabled()
  })
})

describe('useWakeLock', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('holds a screen lock, re-acquires it when the page is visible again and releases it on unmount', async () => {
    const sentinels: { released: boolean; release: () => Promise<void> }[] = []
    const request = vi.fn(async () => {
      const s = { released: false, release: vi.fn(async () => { s.released = true }) }
      sentinels.push(s)
      return s
    })
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })

    const { unmount } = renderHook(() => useWakeLock())
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')

    // The browser drops the lock while hidden
    sentinels[0].released = true
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(2)

    unmount()
    expect(sentinels[1].release).toHaveBeenCalled()
  })

  it('requests only one lock when visibility flips during the first request', async () => {
    let resolve: (s: { released: boolean; release: () => Promise<void> }) => void = () => {}
    const request = vi.fn(() => new Promise((r) => (resolve = r)))
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })
    const { unmount } = renderHook(() => useWakeLock())
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(1)
    const lock = { released: false, release: vi.fn(async () => {}) }
    await act(async () => resolve(lock))
    unmount()
    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it('does nothing where the API is missing', () => {
    expect(() => renderHook(() => useWakeLock()).unmount()).not.toThrow()
  })
})
