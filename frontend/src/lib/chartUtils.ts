/**
 * Compact y-axis tick label: 950 -> "950", 14000 -> "14k", 22500 -> "22.5k".
 * Keeps ticks short so axis labels neither wrap nor clip on narrow screens.
 */
export function formatCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${parseFloat((v / 1_000_000).toFixed(1))}M`
  if (abs >= 1000) return `${parseFloat((v / 1000).toFixed(1))}k`
  return String(parseFloat(v.toFixed(1)))
}
