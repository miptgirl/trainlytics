const trim = (n: number, digits: number) => String(parseFloat(n.toFixed(digits)))

/**
 * Compact y-axis tick label: 950 -> "950", 14000 -> "14k", 22500 -> "22.5k",
 * 0.25 -> "0.25". Keeps ticks short so axis labels neither wrap nor clip on
 * narrow screens.
 */
export function formatCompact(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs < 10) return sign + trim(abs, 2)
  if (abs < 1000) {
    const r = parseFloat(abs.toFixed(1))
    if (r < 1000) return sign + String(r)
    return `${sign}1k`
  }
  if (abs < 1_000_000) {
    const k = parseFloat((abs / 1000).toFixed(1))
    // 999.96k rounds to 1000k: roll over to the next unit
    if (k < 1000) return `${sign}${k}k`
  }
  return `${sign}${trim(abs / 1_000_000, 1)}M`
}
