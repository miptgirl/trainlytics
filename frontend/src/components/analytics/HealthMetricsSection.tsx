import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useHealthMetrics } from '../../lib/analyticsApi'
import { api } from '../../lib/api'

interface MetricPrefs {
  health_metric_resting_hr: boolean
  health_metric_hrv: boolean
  health_metric_weight: boolean
  health_metric_sleep: boolean
  health_metric_vo2_max: boolean
  health_metric_active_energy: boolean
}

interface MetricConfig {
  dataKey: string
  prefKey: keyof MetricPrefs
  label: string
  unit: string
  color: string
  format: (v: number) => string
  yTickFormat: (v: number) => string
}

const METRICS: MetricConfig[] = [
  {
    dataKey: 'resting_hr_bpm',
    prefKey: 'health_metric_resting_hr',
    label: 'Resting HR',
    unit: 'bpm',
    color: '#ef4444',
    format: (v) => `${v.toFixed(0)} bpm`,
    yTickFormat: (v) => String(Math.round(v)),
  },
  {
    dataKey: 'hrv_sdnn_ms',
    prefKey: 'health_metric_hrv',
    label: 'HRV (SDNN)',
    unit: 'ms',
    color: '#8b5cf6',
    format: (v) => `${v.toFixed(1)} ms`,
    yTickFormat: (v) => String(Math.round(v)),
  },
  {
    dataKey: 'weight_kg',
    prefKey: 'health_metric_weight',
    label: 'Body Weight',
    unit: 'kg',
    color: '#f59e0b',
    format: (v) => `${v.toFixed(1)} kg`,
    yTickFormat: (v) => v.toFixed(1),
  },
  {
    dataKey: 'sleep_duration_seconds',
    prefKey: 'health_metric_sleep',
    label: 'Sleep Duration',
    unit: 'h',
    color: '#3b82f6',
    format: (v) => `${(v / 3600).toFixed(1)} h`,
    yTickFormat: (v) => (v / 3600).toFixed(1),
  },
  {
    dataKey: 'vo2_max',
    prefKey: 'health_metric_vo2_max',
    label: 'VO₂ Max',
    unit: 'mL/kg/min',
    color: '#10b981',
    format: (v) => `${v.toFixed(1)} mL/kg/min`,
    yTickFormat: (v) => v.toFixed(1),
  },
  {
    dataKey: 'active_energy_kcal',
    prefKey: 'health_metric_active_energy',
    label: 'Active Energy',
    unit: 'kcal',
    color: '#f97316',
    format: (v) => `${Math.round(v)} kcal`,
    yTickFormat: (v) => String(Math.round(v)),
  },
]

const PERIOD_OPTIONS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: 'All', days: 0 },
]

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function MetricChart({
  metric,
  data,
}: {
  metric: MetricConfig
  data: Record<string, unknown>[]
}) {
  const hasData = data.some((row) => row[metric.dataKey] != null)

  if (!hasData) {
    return (
      <div className="h-52 flex items-center justify-center">
        <p className="text-slate-400 text-sm text-center px-4">
          No data — import Apple Health data to see this chart
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          tickFormatter={metric.yTickFormat}
          width={44}
        />
        <Tooltip
          formatter={(v: number) => [metric.format(v), metric.label]}
          labelFormatter={(label) => formatDateLabel(String(label))}
        />
        <Line
          type="monotone"
          dataKey={metric.dataKey}
          stroke={metric.color}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function HealthMetricsSection() {
  const [days, setDays] = useState(90)
  const [open, setOpen] = useState(false)

  const { data: profile } = useQuery<MetricPrefs>({
    queryKey: ['profile'],
    queryFn: () => api.get<MetricPrefs>('/profile'),
  })

  const { data: metrics, isLoading } = useHealthMetrics(days)

  const prefs: MetricPrefs = profile ?? {
    health_metric_resting_hr: true,
    health_metric_hrv: true,
    health_metric_weight: true,
    health_metric_sleep: true,
    health_metric_vo2_max: true,
    health_metric_active_energy: true,
  }

  const enabledMetrics = METRICS.filter((m) => prefs[m.prefKey])
  const allDisabled = enabledMetrics.length === 0

  const chartData = (metrics ?? []).map((row) => ({
    date: formatDateLabel(row.date),
    resting_hr_bpm: row.resting_hr_bpm,
    hrv_sdnn_ms: row.hrv_sdnn_ms,
    weight_kg: row.weight_kg,
    sleep_duration_seconds: row.sleep_duration_seconds,
    vo2_max: row.vo2_max,
    active_energy_kcal: row.active_energy_kcal,
  }))

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-lg font-semibold text-slate-800">Health</h2>
        <span className="ml-2 text-slate-400 text-sm select-none">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {allDisabled ? (
            <p className="text-slate-400 text-sm text-center py-8">
              All metrics are disabled —{' '}
              <a href="/#/profile?tab=connections" className="text-blue-600 hover:underline">
                enable them in Profile → Apple Health
              </a>
            </p>
          ) : (
            <>
              <div className="flex gap-1 mb-6">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => setDays(opt.days)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      days === opt.days
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {enabledMetrics.map((m) => (
                    <div key={m.dataKey} className="h-52 bg-slate-50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {enabledMetrics.map((m) => (
                    <div key={m.dataKey}>
                      <h3 className="text-sm font-semibold text-slate-600 mb-2">
                        {m.label}{' '}
                        <span className="font-normal text-slate-400">({m.unit})</span>
                      </h3>
                      <MetricChart metric={m} data={chartData} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
