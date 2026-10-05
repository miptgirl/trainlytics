import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * "Update template?" prompt shown on save when a session differs from its
 * template. Modal dialog: focus moves in and returns on close, Tab stays
 * inside, Escape cancels (not while saving).
 */
export function DiffModal({
  templateName,
  changes,
  onYes,
  onNo,
  onCancel,
  isPending,
  isError,
}: {
  templateName: string
  changes: string[]
  onYes: () => void
  onNo: () => void
  onCancel: () => void
  isPending: boolean
  isError: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => opener?.focus?.()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!isPending) onCancel()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const btn = 'w-full min-h-11 rounded-xl text-sm font-medium disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-text/40" onClick={!isPending ? onCancel : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-surface text-text rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Update template "{templateName}"?
        </h2>
        <p className="text-sm text-text-muted-strong">Your session differs from the template:</p>
        <ul className="space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text">
              <span className="mt-0.5 text-text-muted" aria-hidden="true">
                ·
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-text-muted-strong">Save these changes back to the template?</p>

        {isError && (
          <p role="alert" className="text-sm text-error-text">
            Failed to update template. Try again.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={onYes} disabled={isPending} className={`${btn} bg-primary-dark text-white`}>
            {isPending ? 'Saving…' : 'Yes, update template'}
          </button>
          <button
            type="button"
            onClick={onNo}
            disabled={isPending}
            className={`${btn} border border-border bg-surface text-text`}
          >
            No, keep template as-is
          </button>
          <button type="button" onClick={onCancel} disabled={isPending} className={`${btn} text-text-muted-strong`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
