import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface StravaProps {
  configured: boolean
  connected: boolean
  athleteName: string | null
  athleteAvatarUrl: string | null
  lastSyncedAt: string | null
  syncStartDate: string | null
  onNavigateToImports: () => void
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function defaultSyncStartDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

export function StravaSection({
  configured,
  connected,
  athleteName,
  athleteAvatarUrl,
  lastSyncedAt,
  syncStartDate,
  onNavigateToImports,
}: StravaProps) {
  const qc = useQueryClient()

  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const [localSyncStart, setLocalSyncStart] = useState(
    syncStartDate ?? defaultSyncStartDate()
  )

  useEffect(() => {
    if (syncStartDate) setLocalSyncStart(syncStartDate)
  }, [syncStartDate])

  const connectMutation = useMutation({
    mutationFn: () => api.get<{ url: string }>('/strava/auth-url'),
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ queued: boolean }>('/strava/fetch', {}),
    onSuccess: () => {
      setSyncResult('Activities queued for review.')
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['pending-imports'] })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/strava/disconnect'),
    onSuccess: () => {
      setDisconnectConfirm(false)
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const syncStartMutation = useMutation({
    mutationFn: (date: string) =>
      api.patch('/profile', { strava_sync_start_date: date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })

  if (!configured) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* Strava brand mark */}
        <svg viewBox="0 0 64 64" className="w-6 h-6 shrink-0" aria-hidden="true">
          <path
            d="M28 0L12 32h10.4L28 21.6 33.6 32H44L28 0z"
            fill="#FC4C02"
          />
          <path d="M33.6 32L28 21.6 22.4 32H28l5.6 11.2L39.2 32h5.6z" fill="#FC4C02" opacity="0.6" />
        </svg>
        <span className="text-sm font-semibold text-slate-700">Strava</span>
      </div>

      {!connected ? (
        <button
          type="button"
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          className="self-start bg-[#FC4C02] hover:bg-[#e04400] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {connectMutation.isPending ? 'Redirecting…' : 'Connect Strava'}
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Athlete identity */}
          <div className="flex items-center gap-3">
            {athleteAvatarUrl && (
              <img
                src={athleteAvatarUrl}
                alt={athleteName ?? 'Strava athlete'}
                className="w-9 h-9 rounded-full object-cover border border-slate-200"
              />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-800">
                {athleteName ?? 'Connected'}
              </span>
              <span className="text-xs text-green-600 font-medium">Connected ✓</span>
            </div>
          </div>

          {/* Sync start date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-600">Sync start date</label>
            <input
              type="date"
              value={localSyncStart}
              onChange={(e) => setLocalSyncStart(e.target.value)}
              onBlur={() => {
                if (localSyncStart) syncStartMutation.mutate(localSyncStart)
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Last synced */}
          <div className="text-sm text-slate-500">
            Last synced: <span className="text-slate-700">{formatDateTime(lastSyncedAt)}</span>
          </div>

          {/* Sync now */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSyncResult(null)
                syncMutation.mutate()
              }}
              disabled={syncMutation.isPending}
              className="self-start bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {syncMutation.isPending && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
            </button>
            {syncResult && (
              <p className="text-sm text-green-600">
                {syncResult}{' '}
                <button
                  type="button"
                  className="underline hover:text-green-700"
                  onClick={onNavigateToImports}
                >
                  View imports
                </button>
              </p>
            )}
          </div>

          {/* Disconnect */}
          <div>
            {disconnectConfirm ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600">Disconnect Strava?</span>
                <button
                  type="button"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="text-red-600 hover:text-red-700 font-medium"
                >
                  {disconnectMutation.isPending ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
                <button
                  type="button"
                  onClick={() => setDisconnectConfirm(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDisconnectConfirm(true)}
                className="text-sm text-slate-400 hover:text-red-500 transition-colors underline"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
