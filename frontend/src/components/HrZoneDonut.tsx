import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const ZONE_COLORS: Record<string, string> = {
  Z1: '#60a5fa',
  Z2: '#34d399',
  Z3: '#fbbf24',
  Z4: '#fb923c',
  Z5: '#f87171',
}

const ZONE_META = [
  { key: 'Z1', range: '< 132 bpm' },
  { key: 'Z2', range: '133–144 bpm' },
  { key: 'Z3', range: '145–157 bpm' },
  { key: 'Z4', range: '158–169 bpm' },
  { key: 'Z5', range: '≥ 170 bpm' },
]

function formatHms(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface TooltipPayloadEntry {
  payload: {
    name: string
    range: string
    value: number
    pct: number
  }
}

function ZoneTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 text-sm">
      <p className="font-semibold text-slate-800 mb-1">{d.name} — {d.range}</p>
      <p className="text-slate-600">{formatHms(d.value)}</p>
      <p className="text-slate-500">{d.pct.toFixed(1)}% of zone time</p>
    </div>
  )
}

interface HrZoneDonutProps {
  avgHrBpm: number | null
  zones: {
    z1: number | null
    z2: number | null
    z3: number | null
    z4: number | null
    z5: number | null
  }
}

export function HrZoneDonut({ avgHrBpm, zones }: HrZoneDonutProps) {
  const rawSlices = ZONE_META.map((z, i) => ({
    name: z.key,
    range: z.range,
    value: [zones.z1, zones.z2, zones.z3, zones.z4, zones.z5][i] ?? 0,
  })).filter((z) => z.value > 0)

  const total = rawSlices.reduce((s, z) => s + z.value, 0)
  const pieData = rawSlices.map((z) => ({
    ...z,
    pct: total > 0 ? (z.value / total) * 100 : 0,
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-gray-900">HR Zone Distribution</h2>
        {avgHrBpm != null && (
          <span className="text-sm text-gray-500">
            Avg HR: <span className="font-semibold text-gray-900">{avgHrBpm} bpm</span>
          </span>
        )}
      </div>

      {pieData.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                dataKey="value"
                nameKey="name"
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={ZONE_COLORS[entry.name]} />
                ))}
              </Pie>
              <Tooltip content={<ZoneTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1">
            {ZONE_META.map(({ key, range }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: ZONE_COLORS[key] }}
                />
                <span className="font-medium">{key}</span>
                <span className="text-slate-400">{range}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">No zone data recorded.</p>
      )}
    </div>
  )
}
