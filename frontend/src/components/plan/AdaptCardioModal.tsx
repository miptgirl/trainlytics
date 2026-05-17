import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../lib/api'

interface AdaptCardioModalProps {
  hasApiKey: boolean
  plannedSessionId: number
  onClose: () => void
}

export function AdaptCardioModal({ hasApiKey, plannedSessionId, onClose }: AdaptCardioModalProps) {
  const [complaint, setComplaint] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [response, setResponse] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit() {
    if (!complaint.trim()) return
    setStatus('loading')
    setResponse(null)
    setErrorMsg(null)
    try {
      const data = await api.post<{ response: string }>('/ai/adapt-cardio-session', {
        planned_session_id: plannedSessionId,
        complaint: complaint.trim(),
      })
      setResponse(data.response)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Adapt this session</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!hasApiKey ? (
            <p className="text-sm text-slate-500">
              <Link to="/profile" className="text-blue-600 hover:underline font-medium">
                Add an API key in Profile
              </Link>{' '}
              to enable AI session adaptation.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Describe what's going on — an ache, low energy, or a change in conditions — and
                get specific suggestions for adapting today's planned cardio session.
              </p>

              <textarea
                rows={3}
                placeholder="e.g. My right knee is sore today. Should I reduce the distance or swap to cycling?"
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                disabled={status === 'loading'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
              />

              {status === 'error' && errorMsg && (
                <p className="text-sm text-red-600">{errorMsg}</p>
              )}

              {status === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                  <svg
                    className="animate-spin h-4 w-4 text-blue-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Thinking…
                </div>
              )}

              {status === 'success' && response && (
                <div className="prose prose-sm prose-slate max-w-none bg-slate-50 rounded-lg p-3 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {hasApiKey && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0 flex gap-3">
            {status !== 'success' ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!complaint.trim() || status === 'loading'}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {status === 'loading' ? 'Getting suggestions…' : status === 'error' ? 'Retry' : 'Get suggestions'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setStatus('idle'); setResponse(null); setComplaint('') }}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-200"
              >
                Ask another question
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        )}
        {!hasApiKey && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
