import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

interface DebugEnvelope {
  data: unknown
  debug: { sql: string }
}

interface Props {
  fetchUrl: string
  isOpen: boolean
  onClose: () => void
  title: string
}

export function SqlDebugModal({ fetchUrl, isOpen, onClose, title }: Props) {
  const [sql, setSql] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setSql(null)
      setError(null)
      return
    }
    setIsLoading(true)
    const sep = fetchUrl.includes('?') ? '&' : '?'
    api
      .get<DebugEnvelope>(`${fetchUrl}${sep}debug=true`)
      .then((res) => setSql(res.debug?.sql ?? '(no SQL returned)'))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch SQL'))
      .finally(() => setIsLoading(false))
  }, [isOpen, fetchUrl])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <span className="text-xs font-mono font-semibold text-slate-500 tracking-wide">
            SQL — {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none ml-4"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-auto flex-1 min-h-0">
          {isLoading && (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              Loading…
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {sql && (
            <pre className="text-xs font-mono text-slate-700 whitespace-pre overflow-x-auto bg-slate-50 rounded-lg p-4 leading-relaxed">
              {sql}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
