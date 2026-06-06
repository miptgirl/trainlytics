import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { ImportsTab } from '../components/imports/ImportsTab'
import { StravaSection } from '../components/StravaSection'
import { AppleHealthSection } from '../components/AppleHealthSection'

// ── Types ──────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low'
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
type AIProvider = 'anthropic' | 'openai'

interface AiLog {
  id: number
  endpoint: string
  provider: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  duration_ms: number
  error: string | null
  created_at: string | null
  prompt: string
  response: string | null
}

interface GoalItem {
  text: string
  priority: Priority
}

interface UserProfile {
  display_name: string | null
  birth_year: number | null
  experience_level: ExperienceLevel | null
  goals: GoalItem[] | null
  injury_notes: string | null
  coach_notes: string | null
  ai_key_configured: boolean
  ai_provider: AIProvider | null
  strava_configured: boolean
  strava_connected: boolean
  strava_athlete_name: string | null
  strava_athlete_avatar_url: string | null
  strava_last_synced_at: string | null
  strava_sync_start_date: string | null
  health_metric_resting_hr: boolean
  health_metric_hrv: boolean
  health_metric_weight: boolean
  health_metric_sleep: boolean
  health_metric_vo2_max: boolean
  health_metric_active_energy: boolean
}

const PRIORITY_ORDER: Priority[] = ['high', 'medium', 'low']

function sortGoals(goals: GoalItem[]): GoalItem[] {
  return [...goals].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  )
}

// ── Section Card ────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

// ── Label + field helper ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}

// ── Segmented control ───────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit text-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? 'px-4 py-1.5 bg-blue-600 text-white font-medium'
              : 'px-4 py-1.5 bg-white text-slate-600 hover:bg-slate-50 transition-colors'
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Masked key input ────────────────────────────────────────────────────────

function ApiKeyField({
  label,
  isConfigured,
  onSave,
  onRemove,
  isSaving,
}: {
  label: string
  isConfigured: boolean
  onSave: (key: string) => void
  onRemove: () => void
  isSaving: boolean
}) {
  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {isConfigured ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-600 font-medium">Configured ✓</span>
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 transition-colors underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type={revealed ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste API key…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            type="button"
            disabled={!value.trim() || isSaving}
            onClick={() => {
              onSave(value.trim())
              setValue('')
            }}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ── Debug Section (AI logs + SQL executor) ─────────────────────────────────

interface SqlResult {
  columns: string[]
  rows: unknown[][]
  rowcount: number
}

function DebugLogsSection() {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // SQL executor state
  const [sql, setSql] = useState('')
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null)
  const [sqlError, setSqlError] = useState<string | null>(null)
  const [sqlRunning, setSqlRunning] = useState(false)

  const { data: logs, isLoading, refetch } = useQuery<AiLog[]>({
    queryKey: ['ai-logs'],
    queryFn: () => api.get<AiLog[]>('/ai/logs?limit=20'),
    enabled: open,
    staleTime: 0,
  })

  async function runSql() {
    setSqlRunning(true)
    setSqlResult(null)
    setSqlError(null)
    try {
      const result = await api.post<SqlResult>('/debug/sql', { sql })
      setSqlResult(result)
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setSqlRunning(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (!open) refetch() }}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-xs font-mono font-semibold text-slate-400 tracking-widest uppercase">
          ⚙ Debug
        </span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="bg-white">
          {/* AI request logs */}
          <div className="border-b border-slate-100">
            <p className="px-5 pt-4 pb-2 text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
              AI request logs
            </p>
            <div className="divide-y divide-slate-100">
              {isLoading && (
                <p className="px-5 py-4 text-sm text-slate-400">Loading…</p>
              )}
              {!isLoading && (!logs || logs.length === 0) && (
                <p className="px-5 py-4 text-sm text-slate-400">No logs yet.</p>
              )}
              {logs?.map((log) => {
                const isExpanded = expandedId === log.id
                const ts = log.created_at
                  ? new Date(log.created_at).toLocaleString()
                  : '—'
                const statusColor = log.error ? 'text-red-600' : 'text-emerald-600'
                const statusLabel = log.error ? '✗ error' : '✓ ok'

                return (
                  <div key={log.id} className="px-5 py-3">
                    <button
                      type="button"
                      className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <span className="text-xs font-mono text-slate-500 shrink-0">{ts}</span>
                      <span className="text-xs font-semibold text-slate-700 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                        {log.endpoint}
                      </span>
                      <span className="text-xs text-slate-500">{log.provider} / {log.model}</span>
                      {log.input_tokens != null && (
                        <span className="text-xs text-slate-400">
                          {log.input_tokens}↑ {log.output_tokens}↓ tokens
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{log.duration_ms} ms</span>
                      <span className={`text-xs font-semibold ml-auto ${statusColor}`}>{statusLabel}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 flex flex-col gap-3">
                        {log.error && (
                          <div>
                            <p className="text-xs font-semibold text-red-600 mb-1">Error</p>
                            <pre className="text-xs bg-red-50 text-red-700 rounded p-2 whitespace-pre-wrap break-all">{log.error}</pre>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1">Prompt</p>
                          <pre className="text-xs bg-slate-50 text-slate-700 rounded p-2 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{log.prompt}</pre>
                        </div>
                        {log.response && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1">Response (rendered)</p>
                            <div className="prose prose-sm prose-slate max-w-none bg-slate-50 rounded p-2 max-h-64 overflow-y-auto">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{log.response}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* SQL executor */}
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
              SQL
            </p>
            <p className="text-xs text-amber-600">
              ⚠ Direct DB access — changes are permanent.
            </p>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={6}
              placeholder="SELECT * FROM workout_sessions LIMIT 5"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              disabled={!sql.trim() || sqlRunning}
              onClick={runSql}
              className="self-start bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {sqlRunning ? 'Running…' : 'Run'}
            </button>
            {sqlError && (
              <p className="text-xs text-red-600 font-mono">{sqlError}</p>
            )}
            {sqlResult && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                {sqlResult.columns.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500">
                    Query OK — {sqlResult.rowcount} row{sqlResult.rowcount !== 1 ? 's' : ''} affected.
                  </p>
                ) : (
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        {sqlResult.columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {sqlResult.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-xs overflow-hidden text-ellipsis"
                              title={String(cell ?? '')}
                            >
                              {cell === null ? <span className="text-slate-300">null</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

type ProfileTab = 'connections' | 'imports' | 'settings'

export default function ProfilePage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // strava=connected|error arrives from the OAuth callback redirect
  const stravaParam = searchParams.get('strava')

  const activeTab: ProfileTab =
    (searchParams.get('tab') as ProfileTab | null) === 'connections' || stravaParam != null
      ? 'connections'
      : searchParams.get('tab') === 'imports'
        ? 'imports'
        : 'settings'

  function setTab(tab: ProfileTab) {
    setSearchParams(tab === 'settings' ? {} : { tab })
  }

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<UserProfile>('/profile'),
  })

  // Fetch pending count for the tab badge (shared cache with ImportsTab)
  const { data: pendingData } = useQuery<{ total_pending: number }>({
    queryKey: ['pending-imports'],
    queryFn: () => api.get('/imports/pending'),
    select: (d) => ({ total_pending: (d as { total_pending: number }).total_pending }),
  })

  const patchMutation = useMutation({
    mutationFn: (body: Partial<UserProfile> & { ai_key?: string | null }) =>
      api.patch<UserProfile>('/profile', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })

  // ── About ──────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('')
  const [birthYear, setBirthYear] = useState('')

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setBirthYear(profile.birth_year != null ? String(profile.birth_year) : '')
    }
  }, [profile])

  // ── Goals ──────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState<GoalItem[]>([])

  useEffect(() => {
    if (profile) {
      setGoals(sortGoals(profile.goals ?? []))
    }
  }, [profile])

  function saveGoals(updated: GoalItem[]) {
    patchMutation.mutate({ goals: updated })
  }

  function addGoal() {
    const updated = sortGoals([...goals, { text: '', priority: 'medium' }])
    setGoals(updated)
  }

  function removeGoal(idx: number) {
    const updated = goals.filter((_, i) => i !== idx)
    setGoals(updated)
    saveGoals(updated)
  }

  function updateGoalText(idx: number, text: string) {
    setGoals((prev) => prev.map((g, i) => (i === idx ? { ...g, text } : g)))
  }

  function updateGoalPriority(idx: number, priority: Priority) {
    const updated = sortGoals(goals.map((g, i) => (i === idx ? { ...g, priority } : g)))
    setGoals(updated)
    saveGoals(updated)
  }

  function saveGoalText() {
    saveGoals(goals)
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  const [injuryNotes, setInjuryNotes] = useState('')
  const [coachNotes, setCoachNotes] = useState('')

  useEffect(() => {
    if (profile) {
      setInjuryNotes(profile.injury_notes ?? '')
      setCoachNotes(profile.coach_notes ?? '')
    }
  }, [profile])

  // ── AI Provider ────────────────────────────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('anthropic')
  const [keyResetNoticeDismissed, setKeyResetNoticeDismissed] = useState(
    () => !!localStorage.getItem('key_reset_notice_v1')
  )

  useEffect(() => {
    if (profile?.ai_provider) setSelectedProvider(profile.ai_provider)
  }, [profile?.ai_provider])

  function dismissKeyResetNotice() {
    localStorage.setItem('key_reset_notice_v1', '1')
    setKeyResetNoticeDismissed(true)
  }

  if (isLoading) {
    return (
      <Layout>
        <p className="text-slate-400 text-sm">Loading…</p>
      </Layout>
    )
  }

  const pendingCount = pendingData?.total_pending ?? 0

  return (
    <Layout>
      <div className="max-w-xl mx-auto flex flex-col gap-6 pb-10">
        <h1 className="text-xl font-bold text-slate-800">Profile</h1>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {(
            [
              { id: 'connections', label: 'Connections' },
              { id: 'imports', label: 'Imports', badge: pendingCount > 0 ? pendingCount : undefined },
              { id: 'settings', label: 'Settings' },
            ] as { id: ProfileTab; label: string; badge?: number }[]
          ).map(({ id, label, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              {badge != null && (
                <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none font-semibold min-w-[18px] text-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Connections tab ── */}
        {activeTab === 'connections' && (
          <>
            {stravaParam === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                Strava connection failed. Please try again.
              </div>
            )}
            {stravaParam === 'connected' && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                Strava connected successfully.
              </div>
            )}
            <SectionCard title="Connections">
              <div className="flex flex-col gap-6">
                {profile?.strava_configured ? (
                  <StravaSection
                    configured={profile.strava_configured}
                    connected={profile.strava_connected}
                    athleteName={profile.strava_athlete_name}
                    athleteAvatarUrl={profile.strava_athlete_avatar_url}
                    lastSyncedAt={profile.strava_last_synced_at}
                    syncStartDate={profile.strava_sync_start_date}
                    onNavigateToImports={() => setTab('imports')}
                  />
                ) : null}
                <AppleHealthSection
                  health_metric_resting_hr={profile?.health_metric_resting_hr ?? true}
                  health_metric_hrv={profile?.health_metric_hrv ?? true}
                  health_metric_weight={profile?.health_metric_weight ?? true}
                  health_metric_sleep={profile?.health_metric_sleep ?? true}
                  health_metric_vo2_max={profile?.health_metric_vo2_max ?? true}
                  health_metric_active_energy={profile?.health_metric_active_energy ?? true}
                  onNavigateToImports={() => setTab('imports')}
                />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Imports tab ── */}
        {activeTab === 'imports' && (
          <ImportsTab onNavigateToConnections={() => setTab('connections')} />
        )}

        {/* ── Settings tab ── */}
        {activeTab === 'settings' && (
          <>
            {/* ── About ── */}
            <SectionCard title="About">
              <div className="flex flex-col gap-4">
                <Field label="Display name">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={() => patchMutation.mutate({ display_name: displayName || null })}
                    placeholder="Your name"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>

                <Field label="Birth year">
                  <input
                    type="number"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    onBlur={() =>
                      patchMutation.mutate({
                        birth_year: birthYear ? parseInt(birthYear, 10) : null,
                      })
                    }
                    placeholder="e.g. 1990"
                    min={1900}
                    max={new Date().getFullYear()}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                  />
                </Field>

                <Field label="Experience level">
                  <SegmentedControl<ExperienceLevel>
                    options={[
                      { label: 'Beginner', value: 'beginner' },
                      { label: 'Intermediate', value: 'intermediate' },
                      { label: 'Advanced', value: 'advanced' },
                    ]}
                    value={profile?.experience_level ?? null}
                    onChange={(v) => patchMutation.mutate({ experience_level: v })}
                  />
                </Field>
              </div>
            </SectionCard>

            {/* ── Training Goals ── */}
            <SectionCard title="Training Goals">
              <div className="flex flex-col gap-3">
                {goals.length === 0 && (
                  <p className="text-sm text-slate-400">No goals yet. Add one below.</p>
                )}
                {goals.map((goal, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={goal.text}
                      onChange={(e) => updateGoalText(idx, e.target.value)}
                      onBlur={saveGoalText}
                      placeholder="Goal description"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={goal.priority}
                      onChange={(e) => updateGoalPriority(idx, e.target.value as Priority)}
                      className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeGoal(idx)}
                      className="text-slate-400 hover:text-red-500 transition-colors mt-2 leading-none text-lg"
                      aria-label="Remove goal"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGoal}
                  className="self-start text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"
                >
                  + Add goal
                </button>
              </div>
            </SectionCard>

            {/* ── Injury / Limitation Notes ── */}
            <SectionCard title="Injury / Limitation Notes">
              <textarea
                value={injuryNotes}
                onChange={(e) => setInjuryNotes(e.target.value)}
                onBlur={() => patchMutation.mutate({ injury_notes: injuryNotes || null })}
                placeholder="e.g. bad left knee, lower back issues…"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Saved automatically when you leave this field.
              </p>
            </SectionCard>

            {/* ── AI Coach Notes ── */}
            <SectionCard title="AI Coach Notes">
              <textarea
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                onBlur={() => patchMutation.mutate({ coach_notes: coachNotes || null })}
                placeholder="e.g. I train at 6am before work, I prefer compound movements…"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Saved automatically when you leave this field.
              </p>
            </SectionCard>

            {/* ── AI Provider ── */}
            <SectionCard title="AI Provider">
              <div className="flex flex-col gap-5">
                {!keyResetNoticeDismissed && (
                  <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                    <span>API key has been reset. Please re-enter your key.</span>
                    <button
                      type="button"
                      onClick={dismissKeyResetNotice}
                      className="text-amber-500 hover:text-amber-700 shrink-0 leading-none"
                      aria-label="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-slate-600">Provider</span>
                  <SegmentedControl<AIProvider>
                    options={[
                      { label: 'Anthropic', value: 'anthropic' },
                      { label: 'OpenAI', value: 'openai' },
                    ]}
                    value={selectedProvider}
                    onChange={(v) => {
                      setSelectedProvider(v)
                      if (profile?.ai_key_configured) {
                        patchMutation.mutate({ ai_provider: v })
                      }
                    }}
                  />
                </div>

                <ApiKeyField
                  label="API Key"
                  isConfigured={profile?.ai_key_configured ?? false}
                  isSaving={patchMutation.isPending}
                  onSave={(key) => {
                    patchMutation.mutate({ ai_provider: selectedProvider, ai_key: key })
                    dismissKeyResetNotice()
                  }}
                  onRemove={() => patchMutation.mutate({ ai_key: null })}
                />
              </div>
            </SectionCard>

            {/* ── Debug: AI Request Logs ── */}
            <DebugLogsSection />
          </>
        )}
      </div>
    </Layout>
  )
}
