import { useEffect, useRef } from 'react'

/**
 * Open modals in mount order. Only the topmost one reacts to Escape, so a
 * prompt on top of a sheet never closes both, even when focus fell to <body>.
 */
const stack: object[] = []

/** Calls `onEscape` for Escape presses while this is the topmost modal. */
export function useModalEscape(onEscape: () => void): void {
  const handler = useRef(onEscape)
  useEffect(() => {
    handler.current = onEscape
  })
  useEffect(() => {
    const token = {}
    stack.push(token)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && stack[stack.length - 1] === token) handler.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.lastIndexOf(token)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [])
}
