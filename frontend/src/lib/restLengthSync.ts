/**
 * Rest timer length shared between this device and the profile (`rest_seconds`).
 *
 * The device's stored length is what the timer uses. A pick is stored at once
 * and flagged unsynced until the profile has it. While a pick is unsynced or a
 * save is in flight the profile's value is never adopted, so a slow or stale
 * GET can't undo a pick. Saves are single-flight: a pick made during a save
 * waits for it, then the latest value goes out, so the profile ends on the last
 * pick whatever order things resolve in.
 *
 * Module state (not React state) so a save outlives the page that started it.
 */
import type { QueryClient } from '@tanstack/react-query'
import { api } from './api'
import {
  clearStoredRestLength,
  isRestLengthUnsynced,
  isRestStorageKey,
  isValidRestLength,
  loadRestLength,
  saveRestLength,
  setRestLengthUnsynced,
  storedRestLength,
} from './workoutMode'

const PROFILE_KEY = ['profile']

export interface RestLengthState {
  restLength: number
  /** This device holds a pick the profile doesn't have yet. */
  unsynced: boolean
  /** A save is in flight. */
  saving: boolean
  /** Why the last save failed; cleared by the next attempt. */
  error: unknown
}

let saving = false
let error: unknown = null
// Bumped on reset, so a save that outlives a logout lands nowhere
let generation = 0
const listeners = new Set<() => void>()
let snapshot: RestLengthState | null = null

/** Current state; the same object until something changes (for useSyncExternalStore). */
export function getRestLengthState(): RestLengthState {
  const next: RestLengthState = { restLength: loadRestLength(), unsynced: isRestLengthUnsynced(), saving, error }
  if (
    snapshot === null ||
    snapshot.restLength !== next.restLength ||
    snapshot.unsynced !== next.unsynced ||
    snapshot.saving !== next.saving ||
    snapshot.error !== next.error
  ) {
    snapshot = next
  }
  return snapshot
}

// A pick made in another tab reaches this one through the storage event
function onStorage(e: StorageEvent) {
  if (isRestStorageKey(e.key)) emit()
}

export function subscribeRestLength(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

/** A pick on this device: applies at once, then goes to the profile. */
export function chooseRestLength(qc: QueryClient, seconds: number): void {
  if (!isValidRestLength(seconds)) return
  saveRestLength(seconds)
  setRestLengthUnsynced(true)
  emit()
  pushRestLength(qc)
}

/** Sends the device's length if it is unsynced and no save is in flight. */
function pushRestLength(qc: QueryClient): void {
  if (saving || !isRestLengthUnsynced()) return
  const value = loadRestLength()
  const gen = generation
  saving = true
  error = null
  emit()
  api.patch<{ rest_seconds?: unknown } | null>('/profile', { rest_seconds: value }).then(
    (response) => {
      if (gen !== generation) return
      saving = false
      if (loadRestLength() === value) setRestLengthUnsynced(false)
      // Only this field: the response must not roll back fields another
      // request changed meanwhile. It stands even if the refetch fails offline.
      qc.setQueryData(PROFILE_KEY, (old: object | undefined) =>
        old ? { ...old, rest_seconds: response?.rest_seconds } : response,
      )
      // Restarts a GET sent before the save, so its old value never lands
      void qc.invalidateQueries({ queryKey: PROFILE_KEY })
      emit()
      // A pick made during the save goes out now
      pushRestLength(qc)
    },
    (err: unknown) => {
      if (gen !== generation) return
      saving = false
      error = err
      emit()
      // A newer pick made during the failed save gets its own try (once: a
      // plain failure stays unsynced until the next pick or mount)
      if (loadRestLength() !== value) pushRestLength(qc)
    },
  )
}

/**
 * Lines the device up with the profile's `rest_seconds` (`server`; undefined
 * when the profile has no such field). Only on `firstLoad` (once per mount)
 * does it send anything, so a server that keeps answering null can't loop.
 */
export function reconcileRestLength(qc: QueryClient, server: unknown, firstLoad: boolean): void {
  // The save in flight decides
  if (saving) return
  // A pick the profile doesn't have yet wins, and is sent again
  if (isRestLengthUnsynced()) {
    if (firstLoad) pushRestLength(qc)
    return
  }
  if (server === null) {
    // Never set: a length stored here predates profile sync, so it goes up
    if (firstLoad && storedRestLength() !== null) {
      setRestLengthUnsynced(true)
      emit()
      pushRestLength(qc)
    }
    return
  }
  // Set (here or on another device): adopt it
  if (isValidRestLength(server) && storedRestLength() !== server) {
    saveRestLength(server)
    emit()
  }
}

export function clearRestLengthError(): void {
  if (error === null) return
  error = null
  emit()
}

/** Forgets the device's length and any save in flight (on logout). */
export function resetRestLength(): void {
  generation++
  saving = false
  error = null
  clearStoredRestLength()
  emit()
}
