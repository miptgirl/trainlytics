import { act, render, renderHook, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { RestTimer } from '../components/workout/RestTimer'
import { useWakeLock } from '../lib/hooks/useWakeLock'
import {
  DEFAULT_REST_SECONDS,
  allExercisesDone,
  boldTextWidth,
  clearStoredRestLength,
  exerciseSummary,
  formatClock,
  formatLastTime,
  formatSet,
  formatSetList,
  formatSetShort,
  isBlankEntry,
  isRestLengthUnsynced,
  isValidRestLength,
  loadRestLength,
  newExerciseSets,
  nextUnfinishedIndex,
  parseRestInput,
  prefersWorkoutMode,
  restRemaining,
  restSaveErrorMessage,
  sanitizeDecimal,
  saveErrorMessage,
  saveRestLength,
  sessionProgress,
  setRestLengthUnsynced,
  setTabLabel,
  storedRestLength,
  stackWeight,
  stepValue,
  stepWeight,
} from '../lib/workoutMode'

const set = (reps: string, weight: string, done = false, notes = '', rpe = '') => ({ reps, weight, notes, rpe, done })
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

  it('an exercise with no sets is never done, so it stays a Next target and keeps the workout unfinished', () => {
    const withEmpty = [list[0], ex('4')]
    expect(nextUnfinishedIndex(withEmpty, 0)).toBe(1)
    expect(allExercisesDone(withEmpty)).toBe(false)
    expect(allExercisesDone([list[0], ex('2', set('8', '60', true))])).toBe(true)
  })

  it('recognises an untouched placeholder entry', () => {
    expect(isBlankEntry(ex('', set('', '')))).toBe(true)
    expect(isBlankEntry(ex('', set('5', '')))).toBe(false)
    expect(isBlankEntry(ex('4', set('', '')))).toBe(false)
    // A set with only an RPE has been touched
    expect(isBlankEntry(ex('', set('', '', false, '', '8')))).toBe(false)
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
  it('summarises last session as the per-set list, even when every set is the same', () => {
    const s = (reps: number | null, weight: number | null) => ({ set_number: 1, reps, weight })
    expect(formatLastTime({ sets: [s(8, 57.5), s(8, 57.5), s(8, 57.5)] })).toBe('8×57.5, 8×57.5, 8×57.5 kg')
    expect(formatLastTime({ sets: [s(12, null), s(12, null)] })).toBe('12, 12 reps')
    expect(formatLastTime({ sets: [s(8, 60), s(6, 65)] })).toBe('8×60, 6×65 kg')
    expect(formatLastTime({ sets: [s(8, 57.49999)] })).toBe('8×57.5 kg')
    expect(formatLastTime({ sets: [] })).toBeNull()
    expect(formatLastTime(undefined)).toBeNull()
  })

  it('lists sets from the API (numbers) or the form (strings) the same way', () => {
    expect(formatSetList([{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 6, weight: 65 }])).toBe(
      '8×60, 8×60, 6×65 kg',
    )
    expect(formatSetList([set('12', ''), set('10', ''), set('8', '')])).toBe('12, 10, 8 reps')
    expect(formatSetList([set('8', '102.5')])).toBe('8×102.5 kg')
    // Missing reps show as a dash; a set without a weight in a weighted list never reads as kg
    expect(formatSetList([set('', '60'), set('10', '')])).toBe('–×60, 10×– kg')
    expect(formatSetList([{ reps: null, weight: null }])).toBe('– reps')
    expect(formatSetList([])).toBeNull()
  })

  it('formats a set tab: reps×weight, reps alone, a dash for missing reps', () => {
    expect(formatSetShort(set('8', '60'))).toBe('8×60')
    expect(formatSetShort(set('12', ''))).toBe('12')
    expect(formatSetShort(set('', '60'))).toBe('–×60')
    expect(formatSetShort(set('', ''))).toBe('–')
    expect(formatSetShort({ reps: 5, weight: 102.5 })).toBe('5×102.5')
  })

  it('names a set tab for screen readers', () => {
    expect(setTabLabel(set('8', '60', true, '', '7'), 3, 4)).toBe('Set 3 of 4, 8 × 60 kg, RPE 7, done')
    expect(setTabLabel(set('12', ''), 1, 2)).toBe('Set 1 of 2, 12 reps')
  })

  it('summarises a chooser row: today and what is left, else last time, else the set count', () => {
    const last = { sets: [{ set_number: 1, reps: 10, weight: 40 }, { set_number: 2, reps: 8, weight: 40 }] }
    const bench = ex('2', set('8', '60', true), set('8', '60', true), set('8', '60'), set('8', '60'))
    expect(exerciseSummary(bench, last)).toBe('Today: 8×60, 8×60 kg · 2 sets left')
    expect(exerciseSummary(ex('2', set('8', '60', true), set('8', '60')), last)).toBe('Today: 8×60 kg · 1 set left')
    expect(exerciseSummary(ex('2', set('8', '60', true), set('6', '65', true)), last)).toBe('Today: 8×60, 6×65 kg')
    expect(exerciseSummary(ex('3', set('10', '40'), set('10', '40')), last)).toBe('Last time: 10×40, 8×40 kg')
    expect(exerciseSummary(ex('3', set('10', '40'), set('10', '40')), undefined)).toBe('2 sets')
    expect(exerciseSummary(ex('3', set('10', '40')), { sets: [] })).toBe('1 set')
    // All sets deleted: the same words as the dock, history or not
    expect(exerciseSummary(ex('3'), undefined)).toBe('No sets')
    expect(exerciseSummary(ex('3'), last)).toBe('No sets')
  })

  it('formats one set', () => {
    expect(formatSet(set('6', '100'))).toBe('6 × 100 kg')
    expect(formatSet(set('12', ''))).toBe('12 reps')
    expect(formatSet({ reps: '5', weight: '60' })).toBe('5 × 60 kg')
  })

  it('bounds a set value\'s width in Montserrat Bold from above, closely', () => {
    // Widths measured with canvas measureText in Chromium; the dotted ones include kerning
    const measured: [string, number, number][] = [
      ['102.5', 24, 60.576],
      ['102.75', 24, 74.664],
      ['57.5', 24, 48.264],
      ['8888', 24, 63.36],
      ['10×102.5', 12, 50.328],
      ['12×102.75', 11, 51.612],
      ['88×888.88', 24, 132.024],
      ['8.8.8.8', 24, 83.664],
      ['–×60', 14, 33.81],
    ]
    for (const [text, px, width] of measured) {
      expect(boldTextWidth(text, px)).toBeGreaterThanOrEqual(width)
      expect(boldTextWidth(text, px)).toBeLessThan(width * 1.06)
    }
  })

  it('steps a value by delta without going below zero or float noise', () => {
    expect(stepValue('', 1)).toBe('1')
    expect(stepValue('0', -1)).toBe('0')
    expect(stepValue('55', 2.5)).toBe('57.5')
    expect(stepValue('0.1', 0.2)).toBe('0.3')
    expect(stepValue('1', -2.5)).toBe('0')
  })

  it('matches the kg printed on a 10 lb weight stack, 10–200 lb', () => {
    const printed = [4.5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59, 64, 68, 73, 77, 82, 86, 91]
    expect(printed.map((_, i) => stackWeight(i + 1))).toEqual(printed)
  })

  it('steps weight plate by plate on the stack', () => {
    expect(stepWeight('', 1)).toBe('4.5')
    expect(stepWeight('4.5', 1)).toBe('9')
    expect(stepWeight('27', 1)).toBe('32')
    expect(stepWeight('32', -1)).toBe('27')
    expect(stepWeight('91', 1)).toBe('95')
    expect(stepWeight('4.5', -1)).toBe('0')
    expect(stepWeight('0', -1)).toBe('0')
    expect(stepWeight('', -1)).toBe('0')
  })

  it('moves an off-stack weight to the nearest stack value in the step direction', () => {
    expect(stepWeight('30', 1)).toBe('32')
    expect(stepWeight('30', -1)).toBe('27')
    expect(stepWeight('102.5', 1)).toBe('104')
    expect(stepWeight('102.5', -1)).toBe('100')
    expect(stepWeight('2', 1)).toBe('4.5')
    expect(stepWeight('2', -1)).toBe('0')
  })

  it('treats a missing or null weight scale as the default 10 lb stack', () => {
    const stack10 = { kind: 'stack', top_lb: 10, plate_lb: 10, plates: null } as const
    for (const value of ['', '4.5', '30', '102.5']) {
      for (const direction of [1, -1] as const) {
        expect(stepWeight(value, direction, null)).toBe(stepWeight(value, direction))
        expect(stepWeight(value, direction, undefined)).toBe(stepWeight(value, direction))
        expect(stepWeight(value, direction, stack10)).toBe(stepWeight(value, direction))
      }
    }
  })

  it('matches the printed kg of a 10 lb top plate with 15 lb plates', () => {
    const stack15 = { kind: 'stack', top_lb: 10, plate_lb: 15 } as const
    const printed = [4.5, 11, 18, 25, 32, 39, 45, 52, 59, 66, 73, 79, 86, 93, 100, 107, 113, 120, 127, 134, 141, 147, 154, 161, 168, 175]
    expect(printed.map((_, i) => stackWeight(i + 1, stack15))).toEqual(printed)
    expect(stackWeight(0, stack15)).toBe(0)
  })

  it('steps the 15 lb stack plate by plate, moving an off-stack weight to the nearest value', () => {
    const stack15 = { kind: 'stack', top_lb: 10, plate_lb: 15, plates: null } as const
    expect(stepWeight('', 1, stack15)).toBe('4.5')
    expect(stepWeight('4.5', 1, stack15)).toBe('11')
    expect(stepWeight('11', -1, stack15)).toBe('4.5')
    expect(stepWeight('30', 1, stack15)).toBe('32')
    expect(stepWeight('30', -1, stack15)).toBe('25')
    expect(stepWeight('175', 1, stack15)).toBe('181')
  })

  it('stops a capped stack at its last position', () => {
    const capped = { kind: 'stack', top_lb: 10, plate_lb: 15, plates: 26 } as const
    expect(stepWeight('175', 1, capped)).toBe('175')
    expect(stepWeight('170', 1, capped)).toBe('175')
    // An off-stack value above the last position steps down to it, and down from it
    expect(stepWeight('200', 1, capped)).toBe('175')
    expect(stepWeight('200', -1, capped)).toBe('175')
    expect(stepWeight('175', -1, capped)).toBe('168')
    expect(stepWeight('', 1, { ...capped, plates: 1 })).toBe('4.5')
    expect(stepWeight('50', 1, { ...capped, plates: 1 })).toBe('4.5')
  })

  it('caps the 10 lb stack at its 20th position (200 lb)', () => {
    const capped = { kind: 'stack', top_lb: 10, plate_lb: 10, plates: 20 } as const
    expect(stepWeight('91', 1, capped)).toBe('91')
    expect(stepWeight('300', 1, capped)).toBe('91')
    expect(stepWeight('91', -1, capped)).toBe('86')
  })

  it('returns promptly for an absurdly large typed weight', () => {
    const big = '1000000000000000000000000'
    expect(Number(stepWeight(big, -1))).toBeLessThanOrEqual(1_000_000)
    expect(Number(stepWeight(big, 1))).toBeGreaterThan(1_000_000)
  })

  it('returns promptly for a huge typed weight on 1 lb plates, capped or not', () => {
    const big = '1000000000000000000000000'
    const oneLb = { kind: 'stack', top_lb: 1, plate_lb: 1, plates: null } as const
    expect(Number(stepWeight(big, -1, oneLb))).toBeLessThanOrEqual(1_000_000)
    expect(Number(stepWeight(big, 1, oneLb))).toBeGreaterThan(1_000_000)
    // Capped at 20 positions: the last one is 1 + 19 × 1 = 20 lb, printed 9 kg
    const capped = { ...oneLb, plates: 20 }
    expect(stackWeight(20, capped)).toBe(9)
    expect(stepWeight(big, 1, capped)).toBe(stepWeight(big, -1, capped))
    expect(stepWeight(big, 1, capped)).toBe(String(stackWeight(20, capped)))
  })

  it('steps a fixed-increment scale to the next multiple, snapping off-grid values', () => {
    const plates = { kind: 'increment', step_kg: 2.5 } as const
    expect(stepWeight('100', 1, plates)).toBe('102.5')
    expect(stepWeight('100', -1, plates)).toBe('97.5')
    expect(stepWeight('102', 1, plates)).toBe('102.5')
    expect(stepWeight('102', -1, plates)).toBe('100')
    expect(stepWeight('', 1, plates)).toBe('2.5')
    expect(stepWeight('2', -1, plates)).toBe('0')
    expect(stepWeight('0', -1, plates)).toBe('0')
    expect(stepWeight('12.5', 1, { kind: 'increment', step_kg: 5 })).toBe('15')
  })

  it('steps a fixed increment without float noise', () => {
    const tenth = { kind: 'increment', step_kg: 0.1 } as const
    expect(stepWeight('0.2', 1, tenth)).toBe('0.3')
    expect(stepWeight('0.3', 1, tenth)).toBe('0.4')
    expect(stepWeight('0.3', -1, tenth)).toBe('0.2')
    expect(stepWeight('0.1', -1, tenth)).toBe('0')
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

  it('defaults to 90s and keeps a valid choice, preset or not', () => {
    expect(loadRestLength()).toBe(DEFAULT_REST_SECONDS)
    saveRestLength(120)
    expect(loadRestLength()).toBe(120)
    saveRestLength(45)
    expect(loadRestLength()).toBe(45)
  })

  it('tells "nothing stored" apart from a stored 90, and clears both keys', () => {
    expect(storedRestLength()).toBeNull()
    saveRestLength(90)
    expect(storedRestLength()).toBe(90)
    expect(isRestLengthUnsynced()).toBe(false)
    setRestLengthUnsynced(true)
    expect(isRestLengthUnsynced()).toBe(true)
    clearStoredRestLength()
    expect(storedRestLength()).toBeNull()
    expect(isRestLengthUnsynced()).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('once a write fails, reads come from memory, not the older value storage still holds', () => {
    saveRestLength(90)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    try {
      saveRestLength(180)
      setRestLengthUnsynced(true)
      expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('90')
      expect(loadRestLength()).toBe(180)
      expect(isRestLengthUnsynced()).toBe(true)
    } finally {
      setItem.mockRestore()
    }
    // Writable again: storage is the source again
    saveRestLength(120)
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('120')
    expect(loadRestLength()).toBe(120)
    clearStoredRestLength()
    expect(isRestLengthUnsynced()).toBe(false)
    expect(storedRestLength()).toBeNull()
  })

  it('falls back to 90s for a cached value the API would refuse', () => {
    for (const bad of ['10', '605', '92', '90.5', 'abc', '']) {
      localStorage.setItem('trainlytics_rest_seconds', bad)
      expect(loadRestLength()).toBe(DEFAULT_REST_SECONDS)
    }
  })

  it('accepts whole seconds from 15 to 600 in steps of 5', () => {
    expect([15, 45, 135, 600].every(isValidRestLength)).toBe(true)
    expect([0, 10, 92, 605, 90.5, NaN, '90', null].some(isValidRestLength)).toBe(false)
  })

  it('reads typed seconds or m:ss', () => {
    expect(parseRestInput('135')).toBe(135)
    expect(parseRestInput(' 2:15 ')).toBe(135)
    expect(parseRestInput('10:00')).toBe(600)
    expect(parseRestInput('2:5')).toBeNull()
    expect(parseRestInput('1.5')).toBeNull()
    expect(parseRestInput('')).toBeNull()
    expect(parseRestInput('-30')).toBeNull()
  })

  it('explains a failed save: the API detail, or a connection problem', () => {
    const e422 = Object.assign(new Error('rest_seconds: Value error, out of range'), { status: 422 })
    expect(restSaveErrorMessage(e422)).toBe("Couldn't save the rest timer: rest_seconds: Value error, out of range.")
    expect(restSaveErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Check your connection/)
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
