import { useState } from 'react'
import { useAnalyticsHeatmap } from '../../lib/analyticsApi'
import type { HeatmapDay } from '../../lib/analyticsApi'

const STRENGTH_COLOR = '#3b82f6'
const CARDIO_COLOR = '#10b981'
const REST_COLOR = '#e2e8f0'
const CELL = 12
const GAP = 3
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cellBg(types: ('strength' | 'cardio')[]): string {
  const hasS = types.includes('strength')
  const hasC = types.includes('cardio')
  if (hasS && hasC) return `linear-gradient(135deg, ${STRENGTH_COLOR} 50%, ${CARDIO_COLOR} 50%)`
  if (hasS) return STRENGTH_COLOR
  if (hasC) return CARDIO_COLOR
  return REST_COLOR
}

function computeStreaks(data: HeatmapDay[]) {
  const dateSet = new Set(data.map(d => d.date))
  const today = new Date()

  let current = 0
  for (let i = 0; i < 366; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    if (dateSet.has(localDate(d))) current++
    else break
  }

  const sorted = [...dateSet].sort()
  let longest = sorted.length > 0 ? 1 : 0
  let run = sorted.length > 0 ? 1 : 0
  for (let i = 1; i < sorted.length; i++) {
    const ms1 = new Date(sorted[i - 1] + 'T00:00:00').getTime()
    const ms2 = new Date(sorted[i] + 'T00:00:00').getTime()
    if (Math.round((ms2 - ms1) / 86400000) === 1) {
      longest = Math.max(longest, ++run)
    } else {
      run = 1
    }
  }

  return { current, longest }
}

interface WeekDay {
  date: string
  types: ('strength' | 'cardio')[]
}

function buildGrid(data: HeatmapDay[]): (WeekDay | null)[][] {
  const map = new Map(data.map(d => [d.date, d.session_types]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = localDate(today)

  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  const dow = start.getDay()
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow))

  const weeks: (WeekDay | null)[][] = []
  const cur = new Date(start)

  while (localDate(cur) <= todayStr) {
    const week: (WeekDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const ds = localDate(cur)
      if (ds <= todayStr) {
        week.push({ date: ds, types: map.get(ds) ?? [] })
      } else {
        week.push(null)
      }
      cur.setDate(cur.getDate() + 1)
    }
    if (week.some(d => d !== null)) weeks.push(week)
  }
  return weeks
}

interface TooltipState {
  date: string
  types: ('strength' | 'cardio')[]
  left: number
  top: number
}

export function ConsistencyHeatmap() {
  const { data, isLoading } = useAnalyticsHeatmap()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  if (isLoading) return <div className="h-40 bg-slate-50 rounded-lg animate-pulse" />
  if (!data) return null

  const weeks = buildGrid(data)
  const { current: currentStreak, longest: longestStreak } = computeStreaks(data)

  const monthLabels: { weekIdx: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const firstDay = week.find(d => d !== null)
    if (!firstDay) return
    const month = new Date(firstDay.date + 'T00:00:00').getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ weekIdx: wi, label: MONTHS[month] })
      lastMonth = month
    }
  })

  function handleMouseEnter(e: React.MouseEvent, day: WeekDay) {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltip({
      date: day.date,
      types: day.types,
      left: rect.left + rect.width / 2,
      top: rect.top,
    })
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-2">
        {/* Month labels */}
        <div className="flex" style={{ paddingLeft: 28, marginBottom: 4 }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find(m => m.weekIdx === wi)
            return (
              <div
                key={wi}
                style={{ width: CELL + GAP, minWidth: CELL + GAP, fontSize: 10, color: '#94a3b8' }}
              >
                {label?.label ?? ''}
              </div>
            )
          })}
        </div>

        {/* Day labels + grid */}
        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col flex-shrink-0" style={{ width: 28, gap: GAP }}>
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                style={{ height: CELL, fontSize: 9, color: '#94a3b8', lineHeight: `${CELL}px` }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {Array.from({ length: 7 }, (_, di) => {
                  const day = week[di]
                  if (!day) {
                    return <div key={di} style={{ width: CELL, height: CELL }} />
                  }
                  return (
                    <div
                      key={di}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        background: cellBg(day.types),
                        cursor: 'default',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => handleMouseEnter(e, day)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip (fixed to viewport so it works inside overflow-x: auto) */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-800 text-white text-xs rounded px-2 py-1 pointer-events-none"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: 'translate(-50%, calc(-100% - 6px))',
          }}
        >
          <div className="font-medium">
            {new Date(tooltip.date + 'T00:00:00').toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          {tooltip.types.length === 0 ? (
            <div className="text-slate-400">Rest day</div>
          ) : (
            tooltip.types.map(t => (
              <div key={t} style={{ color: t === 'strength' ? '#93c5fd' : '#6ee7b7' }}>
                {t === 'strength' ? 'Strength' : 'Cardio'}
              </div>
            ))
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: REST_COLOR, flexShrink: 0 }} />
          Rest
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: STRENGTH_COLOR, flexShrink: 0 }} />
          Strength
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 12, height: 12, borderRadius: 2, background: CARDIO_COLOR, flexShrink: 0 }} />
          Cardio
        </div>
        <div className="flex items-center gap-1.5">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${STRENGTH_COLOR} 50%, ${CARDIO_COLOR} 50%)`,
              flexShrink: 0,
            }}
          />
          Both
        </div>
      </div>

      {/* Streaks */}
      <div className="flex gap-6 pt-3 border-t border-slate-100">
        <div>
          <div className="text-2xl font-bold text-slate-800">{currentStreak}</div>
          <div className="text-xs text-slate-500">Current streak</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-800">{longestStreak}</div>
          <div className="text-xs text-slate-500">Longest streak</div>
        </div>
      </div>
    </div>
  )
}
