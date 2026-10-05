import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { zoneColor } from '../lib/chartPalette'

/** Z1..Z5 key to its chart-zone colour */
const zoneFill = (key: string) => zoneColor(Number(key.slice(1)) as 1 | 2 | 3 | 4 | 5)

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
    <div className="bg-surface border border-border rounded-lg shadow-sm p-3 text-sm">
      <p className="font-semibold text-text mb-1">{d.name} — {d.range}</p>
      <p className="text-text-muted-strong">{formatHms(d.value)}</p>
      <p className="text-text-muted-strong">{d.pct.toFixed(1)}% of zone time</p>
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
    <div className="bg-surface rounded-xl border border-border p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-text">HR Zone Distribution</h2>
        {avgHrBpm != null && (
          <span className="text-sm text-text-muted-strong">
            Avg HR: <span className="font-semibold text-text">{avgHrBpm} bpm</span>
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
                  <Cell key={entry.name} fill={zoneFill(entry.name)} />
                ))}
              </Pie>
              <Tooltip content={<ZoneTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-1">
            {ZONE_META.map(({ key, range }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-text-muted-strong">
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: zoneFill(key) }}
                />
                <span className="font-medium">{key}</span>
                <span className="text-text-muted-strong">{range}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted-strong text-center py-4">No zone data recorded.</p>
      )}
    </div>
  )
}
