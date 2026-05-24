import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ImportRow } from './ImportRow'
import type { PendingImport, CardioType } from './ImportRow'

interface PendingImportListOut {
  items: PendingImport[]
  total_pending: number
}

interface AcceptAllOut {
  accepted: number
  conflicts: { import_id: number; session_id: number }[]
}

interface ImportsTabProps {
  onNavigateToConnections: () => void
}

export function ImportsTab({ onNavigateToConnections }: ImportsTabProps) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<PendingImportListOut>({
    queryKey: ['pending-imports'],
    queryFn: () => api.get('/imports/pending'),
  })

  const { data: cardioTypes = [] } = useQuery<CardioType[]>({
    queryKey: ['cardio-types'],
    queryFn: () => api.get('/cardio-types'),
  })

  const [acceptAllResult, setAcceptAllResult] = useState<{
    accepted: number
    conflicts: number
  } | null>(null)

  const acceptAllMutation = useMutation({
    mutationFn: () => api.post<AcceptAllOut>('/imports/accept-all'),
    onSuccess: (result) => {
      setAcceptAllResult({
        accepted: result.accepted,
        conflicts: result.conflicts.length,
      })
      qc.invalidateQueries({ queryKey: ['pending-imports'] })
    },
  })

  const items = data?.items ?? []
  const total = data?.total_pending ?? 0

  if (isLoading) {
    return <p className="text-sm text-slate-400 py-4">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Accept All bar */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {total} pending import{total !== 1 ? 's' : ''}
          </p>
          <button
            type="button"
            disabled={acceptAllMutation.isPending}
            onClick={() => {
              setAcceptAllResult(null)
              acceptAllMutation.mutate()
            }}
            className="text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {acceptAllMutation.isPending ? 'Accepting…' : `Accept All (${total})`}
          </button>
        </div>
      )}

      {/* Accept All result banner */}
      {acceptAllResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800">
          {acceptAllResult.accepted} accepted
          {acceptAllResult.conflicts > 0 &&
            ` · ${acceptAllResult.conflicts} conflict${acceptAllResult.conflicts !== 1 ? 's' : ''} to review`}
        </div>
      )}

      {/* Import rows */}
      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ImportRow key={item.id} item={item} cardioTypes={cardioTypes} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 flex flex-col items-center gap-3">
          <p className="text-sm text-slate-500">No pending imports</p>
          <button
            type="button"
            onClick={onNavigateToConnections}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            Go to Connections to sync Strava or upload Apple Health data
          </button>
        </div>
      )}
    </div>
  )
}
