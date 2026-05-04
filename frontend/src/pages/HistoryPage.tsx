import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { formatSessionDateTime } from '../lib/dateUtils'

interface SessionSummary {
  id: number
  type: 'cardio' | 'strength'
  date: string
  notes: string | null
  created_at: string
  total_duration_seconds: number | null
  total_sets: number | null
}

interface SessionListOut {
  items: SessionSummary[]
  total: number
  page: number
  page_size: number
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`
  return `${s}s`
}

export default function HistoryPage() {
  const [type, setType] = useState<'all' | 'cardio' | 'strength'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const params = new URLSearchParams()
  if (type !== 'all') params.set('type', type)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))

  const { data, isLoading } = useQuery<SessionListOut>({
    queryKey: ['sessions', type, dateFrom, dateTo, page],
    queryFn: () => api.get<SessionListOut>(`/sessions?${params.toString()}`),
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1

  function handleFilterChange() {
    setPage(1)
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Workout History</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as 'all' | 'cardio' | 'strength')
            handleFilterChange()
          }}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All types</option>
          <option value="cardio">Cardio</option>
          <option value="strength">Strength</option>
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-slate-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              handleFilterChange()
            }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-slate-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              handleFilterChange()
            }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {(type !== 'all' || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setType('all')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="text-sm text-slate-500 hover:text-blue-600 underline transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-slate-400 text-sm">No sessions found.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/sessions/${s.id}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.type === 'cardio'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {s.type === 'cardio' ? '🏃 Cardio' : '🏋️ Strength'}
                    </span>
                    <span className="font-medium text-slate-900">{formatSessionDateTime(s.date)}</span>
                    {s.notes && (
                      <span className="text-sm text-slate-500 truncate">{s.notes}</span>
                    )}
                  </div>
                  <div className="shrink-0 text-sm text-slate-500 ml-3">
                    {s.type === 'cardio' && s.total_duration_seconds != null
                      ? formatDuration(s.total_duration_seconds)
                      : null}
                    {s.type === 'strength' && s.total_sets != null
                      ? `${s.total_sets} set${s.total_sets !== 1 ? 's' : ''}`
                      : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm text-slate-600">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages} · {data.total} session{data.total !== 1 ? 's' : ''}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
