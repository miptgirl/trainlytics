// Complete set drops taps that come within COMPLETE_SET_GUARD_MS of it appearing (the double-tap guard).
// In a test that clicks it twice in a row, the second click is dropped and the test goes on checking the
// wrong state. So test-setup.ts counts dropped taps and fails any test that leaves some unclaimed.
//
// Clicking Complete set in a test: move the mocked performance.now past the guard first, as the
// completeSet(user) helpers in the workout-mode tests do. A test that drops taps on purpose claims them
// with expect(takeDroppedTaps()).toBe(n).
import { afterEach, beforeEach } from 'vitest'
import { COMPLETE_SET_TAP_DROPPED } from './components/workout/SetTabs'

let dropped = 0

export function takeDroppedTaps(): number {
  const n = dropped
  dropped = 0
  return n
}

export function installTapGuardCheck() {
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (args[0] === COMPLETE_SET_TAP_DROPPED) dropped++
    else warn(...args)
  }
  beforeEach(() => {
    dropped = 0
  })
  afterEach(() => {
    const n = takeDroppedTaps()
    if (n > 0) {
      throw new Error(
        `Complete set ignored ${n} tap(s) in this test: it was clicked less than COMPLETE_SET_GUARD_MS after ` +
          'it appeared. Advance the mocked performance.now first (use the completeSet(user) helper), or, if ' +
          'the test drops taps on purpose, assert it with expect(takeDroppedTaps()).toBe(n). See src/test-tap-guard.ts.',
      )
    }
  })
}
