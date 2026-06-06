import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { secPerKmToMinPerKm } from '../../lib/unitUtils'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CardioType {
  id: number
  name: string
}

interface Segment {
  distance_m: number | null
  duration_seconds: number
  pace_s_per_km: number | null
  activity_type: string | null
}

export interface MappedSession {
  type?: 'cardio' | 'strength'
  source?: string
  activity_type?: string | null
  date?: string | null
  duration_seconds?: number | null
  distance_m?: number | null
  calories?: number | null
  avg_hr_bpm?: number | null
  title?: string | null
  notes?: string | null
  segments?: Segment[]
  proposed_type_name?: string | null
}

export interface PendingImport {
  id: number
  source: string
  status: string
  mapped_session: MappedSession | null
  created_at: string
  updated_at: string
}

interface ConflictInfo {
  session_id: number
  date: string | null
  duration: number | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

function formatDistance(meters: number | null | undefined): string {
  if (!meters) return ''
  const km = meters / 1000
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface ImportRowProps {
  item: PendingImport
  cardioTypes: CardioType[]
}

export function ImportRow({ item, cardioTypes }: ImportRowProps) {
  const qc = useQueryClient()
  const mapped = item.mapped_session ?? {}
  const isCardio = !mapped.type || mapped.type === 'cardio'

  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(mapped.title ?? '')
  const [editDate, setEditDate] = useState(mapped.date ?? '')
  const [editActivityType, setEditActivityType] = useState(mapped.activity_type ?? '')
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pending-imports'] })
  }

  const patchMutation = useMutation({
    mutationFn: (patch: { date?: string; activity_type?: string; title?: string }) =>
      api.patch<PendingImport>(`/imports/${item.id}`, patch),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const acceptMutation = useMutation({
    mutationFn: (force: boolean) =>
      api.post<{ session_id: number }>(`/imports/${item.id}/accept${force ? '?force=true' : ''}`),
    onSuccess: () => invalidate(),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const detail = (err.body as Record<string, unknown>)?.detail as Record<string, unknown>
        setConflict(detail?.conflict as ConflictInfo)
      }
    },
  })

  const discardMutation = useMutation({
    mutationFn: () => api.post(`/imports/${item.id}/discard`),
    onSuccess: () => invalidate(),
  })

  function handleSaveEdit() {
    patchMutation.mutate({
      title: editTitle.trim() || undefined,
      date: editDate || undefined,
      activity_type: editActivityType || undefined,
    })
  }

  function handleCancelEdit() {
    setEditTitle(mapped.title ?? '')
    setEditDate(mapped.date ?? '')
    setEditActivityType(mapped.activity_type ?? '')
    setEditing(false)
  }

  const sourceLabel = item.source === 'strava' ? 'Strava' : 'Apple Health'
  const sourceBadgeCls =
    item.source === 'strava'
      ? 'bg-orange-50 text-orange-700'
      : 'bg-red-50 text-red-700'

  const displayType = mapped.activity_type ?? mapped.proposed_type_name ?? null

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* ── Main row ── */}
      <div className="px-4 py-3 bg-white flex flex-col gap-2">
        {/* Top line: source badge + metadata / edit form */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${sourceBadgeCls}`}>
            {sourceLabel}
          </span>

          {editing ? (
            <div className="flex-1 flex flex-col gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Title"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
              <div className="flex gap-2 flex-wrap">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {isCardio && (
                  <select
                    value={editActivityType}
                    onChange={(e) => setEditActivityType(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex-1 min-w-32"
                  >
                    <option value="">— activity type —</option>
                    {cardioTypes.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={patchMutation.isPending}
                  onClick={handleSaveEdit}
                  className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {patchMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
              {mapped.title && (
                <span className="text-sm font-semibold text-slate-800 truncate">{mapped.title}</span>
              )}
              {displayType && (
                <span className="text-sm text-slate-600">
                  {displayType}
                  {mapped.proposed_type_name && !mapped.activity_type && (
                    <span className="ml-1 text-xs text-amber-600">(new type)</span>
                  )}
                </span>
              )}
              <span className="text-sm text-slate-500">{formatDate(mapped.date)}</span>
              <span className="text-sm text-slate-500">{formatDuration(mapped.duration_seconds)}</span>
              {isCardio && mapped.distance_m ? (
                <span className="text-sm text-slate-500">{formatDistance(mapped.distance_m)}</span>
              ) : null}
              {mapped.avg_hr_bpm != null && (
                <span className="text-sm text-slate-400">{mapped.avg_hr_bpm} bpm</span>
              )}
            </div>
          )}
        </div>

        {/* Conflict warning */}
        {conflict && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 flex items-center justify-between gap-3">
            <span>
              Possible duplicate of session on {conflict.date}
              {conflict.duration != null && ` (${formatDuration(conflict.duration)})`} — accept anyway?
            </span>
            <button
              type="button"
              disabled={acceptMutation.isPending}
              onClick={() => {
                setConflict(null)
                acceptMutation.mutate(true)
              }}
              className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
            >
              Accept anyway
            </button>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-3 mt-0.5">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {expanded ? 'Hide details' : 'Details'}
          </button>

          <div className="flex-1" />

          {discardConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Discard this import?</span>
              <button
                type="button"
                disabled={discardMutation.isPending}
                onClick={() => discardMutation.mutate()}
                className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                Yes, discard
              </button>
              <button
                type="button"
                onClick={() => setDiscardConfirm(false)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDiscardConfirm(true)}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Discard
            </button>
          )}

          <button
            type="button"
            disabled={acceptMutation.isPending || !!conflict}
            onClick={() => {
              setConflict(null)
              acceptMutation.mutate(false)
            }}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {acceptMutation.isPending ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
            Session preview
          </p>
          <div className="text-xs text-slate-600 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-slate-400">Type</span>
            <span>{mapped.type ?? '—'}</span>
            <span className="text-slate-400">Source</span>
            <span>{mapped.source ?? '—'}</span>
            <span className="text-slate-400">Date</span>
            <span>{mapped.date ?? '—'}</span>
            <span className="text-slate-400">Duration</span>
            <span>{formatDuration(mapped.duration_seconds)}</span>
            {isCardio && (
              <>
                <span className="text-slate-400">Distance</span>
                <span>{formatDistance(mapped.distance_m) || '—'}</span>
              </>
            )}
            {mapped.calories != null && (
              <>
                <span className="text-slate-400">Calories</span>
                <span>{mapped.calories} kcal</span>
              </>
            )}
            {mapped.avg_hr_bpm != null && (
              <>
                <span className="text-slate-400">Avg HR</span>
                <span>{mapped.avg_hr_bpm} bpm</span>
              </>
            )}
          </div>

          {isCardio && mapped.segments && mapped.segments.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-slate-400 mb-1">
                Segments ({mapped.segments.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {mapped.segments.map((seg, i) => (
                  <div key={i} className="text-xs font-mono text-slate-600 grid grid-cols-3 gap-x-4">
                    <span>
                      {i + 1}. {seg.activity_type ?? '—'}
                    </span>
                    <span>{formatDuration(seg.duration_seconds)}</span>
                    <span>
                      {formatDistance(seg.distance_m)}
                      {seg.pace_s_per_km
                        ? ` · ${secPerKmToMinPerKm(seg.pace_s_per_km)}`
                        : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
