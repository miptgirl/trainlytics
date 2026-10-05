import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal bottom sheet: focus moves in on open, Tab stays inside, Escape or the
 * overlay closes it, and focus returns to the opener on close.
 */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()
    // Keep the page behind the sheet from scrolling (incl. iOS rubber-banding)
    const root = document.documentElement
    const prev = { html: root.style.overflow, body: document.body.style.overflow }
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev.html
      document.body.style.overflow = prev.body
      opener?.focus?.()
    }
  }, [])

  // Escape on the document, so it works even if focus fell out of the sheet
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
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

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label={`Close ${title}`}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-text/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-xl max-h-[85dvh] flex flex-col bg-surface text-text rounded-t-2xl shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2 pl-4 pr-1 pt-1 border-b border-border">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 flex items-center justify-center text-text-muted-strong text-xl"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  )
}
