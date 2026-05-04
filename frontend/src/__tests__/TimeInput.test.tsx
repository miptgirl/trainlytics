import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { formatSeconds, parseTimeString, TimeInput } from '../components/TimeInput'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTimeString', () => {
  it('parses m:ss', () => {
    expect(parseTimeString('5:30')).toBe(330)
    expect(parseTimeString('0:00')).toBe(0)
    expect(parseTimeString('45:00')).toBe(2700)
  })

  it('parses h:mm:ss', () => {
    expect(parseTimeString('1:05:30')).toBe(3930)
    expect(parseTimeString('0:45:00')).toBe(2700)
    expect(parseTimeString('2:00:00')).toBe(7200)
  })

  it('returns null for invalid strings', () => {
    expect(parseTimeString('abc')).toBeNull()
    expect(parseTimeString('5:70')).toBeNull()   // seconds ≥ 60
    expect(parseTimeString('1:70:00')).toBeNull() // minutes ≥ 60
    expect(parseTimeString('5')).toBeNull()
    expect(parseTimeString('')).toBeNull()
    expect(parseTimeString('1:2:3')).toBeNull()  // not zero-padded seconds
  })

  it('trims whitespace', () => {
    expect(parseTimeString('  5:30  ')).toBe(330)
  })
})

describe('formatSeconds', () => {
  it('formats duration < 1 h as m:ss', () => {
    expect(formatSeconds(330, 'duration')).toBe('5:30')
    expect(formatSeconds(2700, 'duration')).toBe('45:00')
    expect(formatSeconds(3599, 'duration')).toBe('59:59')
  })

  it('formats duration ≥ 1 h as h:mm:ss', () => {
    expect(formatSeconds(3600, 'duration')).toBe('1:00:00')
    expect(formatSeconds(3930, 'duration')).toBe('1:05:30')
    expect(formatSeconds(7200, 'duration')).toBe('2:00:00')
  })

  it('formats pace always as m:ss', () => {
    expect(formatSeconds(330, 'pace')).toBe('5:30')
    expect(formatSeconds(3930, 'pace')).toBe('65:30')
  })

  it('round-trips: format → parse → format', () => {
    const cases = [0, 30, 330, 2700, 3930, 7200]
    for (const s of cases) {
      expect(parseTimeString(formatSeconds(s, 'duration'))).toBe(s)
      expect(parseTimeString(formatSeconds(s, 'pace'))).toBe(s)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

describe('TimeInput component', () => {
  it('displays the formatted value from the value prop', () => {
    render(<TimeInput value={330} onChange={vi.fn()} format="pace" />)
    expect(screen.getByRole('textbox')).toHaveValue('5:30')
  })

  it('shows empty string when value is null', () => {
    render(<TimeInput value={null} onChange={vi.fn()} format="duration" />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('calls onChange with parsed seconds on valid blur', async () => {
    const onChange = vi.fn()
    render(<TimeInput value={null} onChange={onChange} format="duration" />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '1:05:30')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(3930)
  })

  it('calls onChange(null) and shows error on invalid blur', async () => {
    const onChange = vi.fn()
    render(<TimeInput value={null} onChange={onChange} format="duration" />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'abc')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByText(/valid time/i)).toBeInTheDocument()
  })

  it('calls onChange(null) and clears error on empty blur', async () => {
    const onChange = vi.fn()
    render(<TimeInput value={330} onChange={onChange} format="pace" />)
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText(/valid time/i)).not.toBeInTheDocument()
  })

  it('normalises display to canonical format after valid blur', async () => {
    const onChange = vi.fn()
    render(<TimeInput value={null} onChange={onChange} format="duration" />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '5:30')
    fireEvent.blur(input)
    expect(input).toHaveValue('5:30')
  })

  it('syncs display when value prop changes externally', () => {
    const { rerender } = render(<TimeInput value={330} onChange={vi.fn()} format="pace" />)
    expect(screen.getByRole('textbox')).toHaveValue('5:30')
    rerender(<TimeInput value={660} onChange={vi.fn()} format="pace" />)
    expect(screen.getByRole('textbox')).toHaveValue('11:00')
  })
})
