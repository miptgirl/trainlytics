import { useEffect } from 'react'

/**
 * Keeps the screen on while `active`, where the Screen Wake Lock API exists.
 * The browser drops the lock when the page is hidden, so it is re-acquired
 * when the page becomes visible again; released on unmount.
 */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let requesting = false
    let disposed = false

    async function acquire() {
      // One request at a time; visibility can flip while the first is pending
      if (disposed || requesting || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      requesting = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed || (sentinel && !sentinel.released)) void lock.release()
        else sentinel = lock
      } catch {
        // Denied (battery saver, permissions policy): the screen may sleep
      } finally {
        requesting = false
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel && !sentinel.released) void sentinel.release()
      sentinel = null
    }
  }, [active])
}
