import { useState } from 'react'
import { type PlannedSessionOut, useUpdateSkipNote } from '../../lib/planApi'

interface SkipNoteModalProps {
  session: PlannedSessionOut
  weekStart: string
  onClose: () => void
  /** Today screen: skipping needs a reason, because the note is what marks a session skipped. */
  requireNote?: boolean
}

export function SkipNoteModal({ session, weekStart, onClose, requireNote = false }: SkipNoteModalProps) {
  const [note, setNote] = useState(session.skip_note ?? '')
  const mutation = useUpdateSkipNote()

  function handleSave() {
    mutation.mutate(
      { weekStart, sessionId: session.id, skip_note: note.trim() || null },
      { onSuccess: onClose }
    )
  }

  function handleClear() {
    mutation.mutate(
      { weekStart, sessionId: session.id, skip_note: null },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-text/40 px-0 sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface pb-[env(safe-area-inset-bottom)] sm:pb-0 w-full sm:max-w-md rounded-t-[20px] sm:rounded-xl shadow-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-text">Skip note</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-muted-strong text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-text-muted-strong">
            Add a reason this session was skipped — it helps the AI coach give better advice.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Knee pain, rest day, travel…"
            disabled={mutation.isPending}
            className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none disabled:opacity-50"
          />
        </div>

        <div className="px-4 pb-4 pt-1 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending || (requireNote && !note.trim())}
            className="flex-1 bg-primary-dark text-white py-2.5 rounded-xl text-sm font-medium hover:brightness-95 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {session.skip_note && (
            <button
              type="button"
              onClick={handleClear}
              disabled={mutation.isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-error/40 text-error-text hover:bg-error/10 disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-text hover:bg-bg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
