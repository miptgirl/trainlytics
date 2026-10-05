import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../lib/api'

interface WeeklyInsightsCardProps {
  hasApiKey: boolean
}

export function WeeklyInsightsCard({ hasApiKey }: WeeklyInsightsCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleAnalyse() {
    setStatus('loading')
    setAnalysis(null)
    setErrorMsg(null)
    try {
      const data = await api.post<{ analysis: string }>('/ai/weekly-insights', {})
      setAnalysis(data.analysis)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">AI Insights</h2>
        {hasApiKey && status === 'idle' && (
          <button
            onClick={handleAnalyse}
            className="text-xs font-medium bg-primary-dark text-white px-3 py-1.5 rounded-lg hover:brightness-95 transition-colors"
          >
            Analyse this week
          </button>
        )}
        {hasApiKey && status === 'success' && (
          <button
            onClick={() => { setStatus('idle'); setAnalysis(null) }}
            className="text-xs text-text-muted-strong hover:text-text"
          >
            Clear
          </button>
        )}
        {hasApiKey && status === 'error' && (
          <button
            onClick={handleAnalyse}
            className="text-xs font-medium bg-primary-dark text-white px-3 py-1.5 rounded-lg hover:brightness-95 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {!hasApiKey && (
          <p className="text-sm text-text-muted-strong">
            <Link to="/profile" className="text-primary-dark hover:underline font-medium">
              Add an API key in Profile
            </Link>{' '}
            to enable AI analysis of your training.
          </p>
        )}

        {hasApiKey && status === 'idle' && (
          <p className="text-sm text-text-muted-strong italic">
            Press "Analyse this week" to get AI feedback on your recent training.
          </p>
        )}

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-text-muted-strong py-1">
            <svg
              className="animate-spin h-4 w-4 text-primary-dark"
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
            Analysing your training…
          </div>
        )}

        {status === 'success' && analysis && (
          <div className="prose prose-sm prose-slate max-w-none max-h-64 overflow-y-auto leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <p className="text-sm text-error-text">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  )
}
