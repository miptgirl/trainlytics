import { useMemo } from 'react'

/**
 * Chart colours for recharts and inline styles.
 *
 * recharts writes colours as SVG attributes, where `var(--x)` doesn't resolve
 * reliably, so this reads the design-system CSS variables (index.css
 * `@theme static`) at call time and falls back to the spec hex when the
 * variable is missing (tests, SSR). Call the functions during render, not at
 * module load, so the stylesheet has been applied.
 */

const FALLBACK = {
  primary: '#7E9B76',
  'primary-dark': '#4F6B52',
  'primary-light': '#B8C9B2',
  'primary-tint': '#E6EFE3',
  surface: '#FFFDF8',
  border: '#E8E4DA',
  text: '#2F342F',
  'text-muted': '#737A70',
  'text-muted-strong': '#656B63',
  accent: '#C98F8F',
  success: '#6F9E78',
  warning: '#D1A15D',
  error: '#C86F62',
  'chart-strength': '#7E9B76',
  'chart-yoga': '#C98F8F',
  'chart-running': '#D1A15D',
  'chart-cycling': '#8297A5',
  'chart-walking': '#A58A76',
  'chart-swimming': '#9B8DB6',
  'chart-zone-1': '#8297A5',
  'chart-zone-2': '#7E9B76',
  'chart-zone-3': '#D1A15D',
  'chart-zone-4': '#C98F8F',
  'chart-zone-5': '#C86F62',
} as const

export type ChartToken = keyof typeof FALLBACK

/** Resolved colour for a design-system token; the spec hex when the CSS variable is unavailable. */
export function chartColor(token: ChartToken): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim()
    if (v) return v
  }
  return FALLBACK[token]
}

/** Axis tick labels and reference lines (small text, so the contrast-safe muted shade). */
export const axisColor = () => chartColor('text-muted-strong')
/** Grid lines. */
export const gridColor = () => chartColor('border')

const CATEGORICAL: ChartToken[] = [
  'chart-strength',
  'chart-running',
  'chart-cycling',
  'chart-walking',
  'chart-swimming',
  'chart-yoga',
]

/** Categorical series colour by position (types, tags, pace series); cycles after six. */
export function categoricalColor(index: number): string {
  const n = CATEGORICAL.length
  return chartColor(CATEGORICAL[((index % n) + n) % n])
}

/** HR zone colour, zone 1..5 (cool to hot). */
export function zoneColor(zone: 1 | 2 | 3 | 4 | 5): string {
  return chartColor(`chart-zone-${zone}` as ChartToken)
}

const ACTIVITY_RULES: [RegExp, ChartToken][] = [
  [/run|jog/i, 'chart-running'],
  [/walk|hike/i, 'chart-walking'],
  [/cycl|bike|biking|ride/i, 'chart-cycling'],
  [/swim/i, 'chart-swimming'],
  [/yoga|pilates/i, 'chart-yoga'],
  [/gym|strength|weight/i, 'chart-strength'],
]

/**
 * Colour for an activity type by name (Running, Walking, Cycling, Swimming,
 * Yoga/Pilates, Gym/Strength). Unknown names take the categorical colour for
 * `fallbackIndex`.
 */
export function activityColor(name: string, fallbackIndex = 0): string {
  for (const [rx, token] of ACTIVITY_RULES) if (rx.test(name)) return chartColor(token)
  return categoricalColor(fallbackIndex)
}

/**
 * Colours for a set of activity types in one chart: named types keep their
 * token colour; unknown names take categorical colours not already used by a
 * named type (or an earlier unknown), so two series never share a colour until
 * the six categorical colours run out.
 */
export function activityColors(names: string[]): string[] {
  const named = names.map((n) => ACTIVITY_RULES.find(([rx]) => rx.test(n))?.[1] ?? null)
  const used = new Set<ChartToken>(named.filter((t): t is ChartToken => t !== null))
  let next = 0
  return names.map((_, i) => {
    const token = named[i]
    if (token) return chartColor(token)
    const free = CATEGORICAL.find((t) => !used.has(t))
    if (free) {
      used.add(free)
      return chartColor(free)
    }
    return categoricalColor(next++)
  })
}

/** Memoised palette for components that need many colours per render. */
export function useChartPalette() {
  return useMemo(
    () => ({
      axis: axisColor(),
      grid: gridColor(),
      zones: ([1, 2, 3, 4, 5] as const).map(zoneColor),
      heat: {
        strength: chartColor('chart-strength'),
        cardio: chartColor('chart-running'),
        rest: chartColor('border'),
      },
    }),
    [],
  )
}

/** Sage ramp for intensity heatmaps, empty to strongest. */
export function heatmapRamp(): string[] {
  return [chartColor('border'), chartColor('primary-light'), chartColor('primary'), chartColor('primary-dark')]
}
