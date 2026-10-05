/** "Update template?" prompt shown on save when a session differs from its template. */
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!isPending ? onCancel : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Update template "{templateName}"?
        </h2>
        <p className="text-sm text-gray-600">
          Your session differs from the template:
        </p>
        <ul className="space-y-1">
          {changes.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-gray-400">·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-600">
          Save these changes back to the template?
        </p>

        {isError && (
          <p className="text-sm text-red-600">Failed to update template. Try again.</p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onYes}
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl"
          >
            {isPending ? 'Saving…' : 'Yes, update template'}
          </button>
          <button
            onClick={onNo}
            disabled={isPending}
            className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 text-sm font-medium py-2.5 rounded-xl"
          >
            No, keep template as-is
          </button>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="w-full text-gray-500 hover:text-gray-700 disabled:opacity-50 text-sm py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
