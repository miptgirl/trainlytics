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

  it('writes September as "Sep"', () => {
    expect(formatShortDate('2026-09-28')).toBe('Mon, 28 Sep')
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

  it('keeps up to 2 decimals below 10', () => {
    expect(formatCompact(0.25)).toBe('0.25')
    expect(formatCompact(1.234)).toBe('1.23')
    expect(formatCompact(2.5)).toBe('2.5')
  })

  it('rolls over instead of printing 1000k', () => {
    expect(formatCompact(999_960)).toBe('1M')
    expect(formatCompact(999.97)).toBe('1k')
    expect(formatCompact(999_000)).toBe('999k')
  })

  it('abbreviates millions', () => {
    expect(formatCompact(2_500_000)).toBe('2.5M')
  })
})
