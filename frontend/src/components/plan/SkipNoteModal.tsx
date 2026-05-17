import { useState } from 'react'
import { type PlannedSessionOut, useUpdateSkipNote } from '../../lib/planApi'

interface SkipNoteModalProps {
  session: PlannedSessionOut
  weekStart: string
  onClose: () => void
}

export function SkipNoteModal({ session, weekStart, onClose }: SkipNoteModalProps) {
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Skip note</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            Add a reason this session was skipped — it helps the AI coach give better advice.
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Knee pain, rest day, travel…"
            disabled={mutation.isPending}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
          />
        </div>

        <div className="px-4 pb-4 pt-1 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {session.skip_note && (
            <button
              type="button"
              onClick={handleClear}
              disabled={mutation.isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
