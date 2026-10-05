import { describe, it, expect } from 'vitest'
import { formatShortDate } from '../lib/dateUtils'
import { formatCompact } from '../lib/chartUtils'

describe('formatShortDate', () => {
  it('formats a date as "Sun, 4 Oct"', () => {
    expect(formatShortDate('2026-10-04')).toBe('Sun, 4 Oct')
  })

  it('does not pad the day and uses the short month', () => {
    expect(formatShortDate('2026-05-09')).toBe('Sat, 9 May')
  })
})

describe('formatCompact', () => {
  it('leaves values under 1000 as whole numbers', () => {
    expect(formatCompact(0)).toBe('0')
    expect(formatCompact(225)).toBe('225')
  })

  it('abbreviates thousands without trailing zeros', () => {
    expect(formatCompact(14000)).toBe('14k')
    expect(formatCompact(22500)).toBe('22.5k')
  })

  it('abbreviates millions', () => {
    expect(formatCompact(2_500_000)).toBe('2.5M')
  })
})
