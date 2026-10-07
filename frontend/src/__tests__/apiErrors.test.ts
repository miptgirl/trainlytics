import { describe, it, expect } from 'vitest'
import { formatErrorDetail } from '../lib/api'

describe('formatErrorDetail', () => {
  it('keeps string details', () => {
    expect(formatErrorDetail('Session not found')).toBe('Session not found')
  })

  it('prefixes each FastAPI validation message with a readable location', () => {
    const detail = [
      {
        type: 'less_than_equal',
        loc: ['body', 'exercises', 0, 'sets', 1, 'rpe'],
        msg: 'Input should be less than or equal to 10',
        input: 11,
        ctx: { le: 10 },
      },
      {
        type: 'int_from_float',
        loc: ['body', 'rpe'],
        msg: 'Input should be a valid integer, got a number with a fractional part',
        input: 7.5,
      },
    ]
    expect(formatErrorDetail(detail)).toBe(
      'exercise 1 › set 2 › rpe: Input should be less than or equal to 10; ' +
        'rpe: Input should be a valid integer, got a number with a fractional part',
    )
  })

  it('shows just the message when the location is only "body"', () => {
    expect(formatErrorDetail([{ type: 'missing', loc: ['body'], msg: 'Field required' }])).toBe('Field required')
  })

  it('falls back when there is no detail', () => {
    expect(formatErrorDetail(undefined)).toBe('Request failed')
    expect(formatErrorDetail([])).toBe('Request failed')
  })
})
