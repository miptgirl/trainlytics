import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useHrZoneTrends } from '../../lib/analyticsApi'

const ZONE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171']
const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
const ZONE_RANGES = ['< 132 bpm', '133–144 bpm', '145–157 bpm', '158–169 bpm', '≥ 170 bpm']

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface ChartRow {
  week: string
  z1: number; z2: number; z3: number; z4: number; z5: number
  z1_m: number; z2_m: number; z3_m: number; z4_m: number; z5_m: number
  total_m: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HrZoneTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartRow
  const zoneMinutes = [row.z1_m, row.z2_m, row.z3_m, row.z4_m, row.z5_m]
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-slate-700 mb-2">{row.week}</p>
      {ZONE_LABELS.map((label, i) => {
        const minutes = zoneMinutes[i]
        const pct = row.total_m > 0 ? (minutes / row.total_m * 100).toFixed(1) : '0.0'
        return (
          <div key={label} className="flex items-center gap-2 mb-0.5 last:mb-0">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ZONE_COLORS[i] }} />
            <span className="text-slate-500 w-32">{label} ({ZONE_RANGES[i]})</span>
            <span className="font-medium text-slate-700 w-14 text-right">{minutes.toFixed(1)} min</span>
            <span className="text-slate-400 w-10 text-right">({pct}%)</span>
          </div>
        )
      })}
    </div>
  )
}

export function HrZoneTrendsChart() {
  const { data, isLoading } = useHrZoneTrends()
  const [mode, setMode] = useState<'minutes' | 'percent'>('minutes')

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  const hasData = data?.some(
    (r) => r.z1_minutes + r.z2_minutes + r.z3_minutes + r.z4_minutes + r.z5_minutes > 0,
  )
  if (!data || !hasData) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">No HR zone data recorded yet.</p>
    )
  }

  const chartData: ChartRow[] = data.map((r) => {
    const total = r.z1_minutes + r.z2_minutes + r.z3_minutes + r.z4_minutes + r.z5_minutes
    const toVal = (v: number) =>
      mode === 'minutes' ? v : total > 0 ? parseFloat((v / total * 100).toFixed(1)) : 0
    return {
      week: formatWeekLabel(r.week_start),
      z1: toVal(r.z1_minutes), z2: toVal(r.z2_minutes), z3: toVal(r.z3_minutes),
      z4: toVal(r.z4_minutes), z5: toVal(r.z5_minutes),
      z1_m: r.z1_minutes, z2_m: r.z2_minutes, z3_m: r.z3_minutes,
      z4_m: r.z4_minutes, z5_m: r.z5_minutes,
      total_m: total,
    }
  })

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        {(['minutes', 'percent'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {m === 'minutes' ? 'Minutes' : '%'}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => mode === 'minutes' ? `${v}` : `${v}%`}
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            domain={mode === 'percent' ? [0, 100] : undefined}
          />
          <Tooltip content={<HrZoneTooltip />} />
          <Bar dataKey="z1" stackId="zones" fill={ZONE_COLORS[0]} name="Z1" />
          <Bar dataKey="z2" stackId="zones" fill={ZONE_COLORS[1]} name="Z2" />
          <Bar dataKey="z3" stackId="zones" fill={ZONE_COLORS[2]} name="Z3" />
          <Bar dataKey="z4" stackId="zones" fill={ZONE_COLORS[3]} name="Z4" />
          <Bar dataKey="z5" stackId="zones" fill={ZONE_COLORS[4]} name="Z5" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
        {ZONE_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: ZONE_COLORS[i] }} />
            <span>{label} {ZONE_RANGES[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
