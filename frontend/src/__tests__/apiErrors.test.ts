import { describe, it, expect } from 'vitest'
import { formatErrorDetail } from '../lib/api'

describe('formatErrorDetail', () => {
  it('keeps string details', () => {
    expect(formatErrorDetail('Session not found')).toBe('Session not found')
  })

  it('joins the msgs of a FastAPI validation error list', () => {
    const detail = [
      { type: 'multiple_of', loc: ['body', 'exercises', 0, 'sets', 0, 'rpe'], msg: 'Input should be a multiple of 0.5' },
      { type: 'less_than_equal', loc: ['body', 'rpe'], msg: 'Input should be less than or equal to 10' },
    ]
    expect(formatErrorDetail(detail)).toBe(
      'Input should be a multiple of 0.5; Input should be less than or equal to 10',
    )
  })

  it('falls back when there is no detail', () => {
    expect(formatErrorDetail(undefined)).toBe('Request failed')
    expect(formatErrorDetail([])).toBe('Request failed')
  })
})
