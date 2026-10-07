import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmojiRating, EmojiRatingDisplay } from '../components/EmojiRating'
import { RPE_OPTIONS, WELLBEING_OPTIONS, optionForValue } from '../components/emojiRatingOptions'

describe('RPE_OPTIONS', () => {
  it('reads easy → hard and emits 2/4/6/8/10', () => {
    expect(RPE_OPTIONS.map((o) => [o.label, o.value])).toEqual([
      ['Very easy', 2],
      ['Easy', 4],
      ['Moderate', 6],
      ['Hard', 8],
      ['All-out', 10],
    ])
  })
})

describe('optionForValue', () => {
  it('finds an option by its value', () => {
    expect(optionForValue(RPE_OPTIONS, 8).label).toBe('Hard')
    expect(optionForValue(WELLBEING_OPTIONS, 3).label).toBe('Okay')
  })

  it('picks the nearest option for values without one; ties go lower', () => {
    expect(optionForValue(RPE_OPTIONS, 1).label).toBe('Very easy')
    expect(optionForValue(RPE_OPTIONS, 7).label).toBe('Moderate')
    expect(optionForValue(RPE_OPTIONS, 9).label).toBe('Hard')
  })
})

describe('EmojiRating', () => {
  it('emits the option value and marks it pressed', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <EmojiRating label="How hard was that?" options={RPE_OPTIONS} value={null} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Hard/ }))
    expect(onChange).toHaveBeenCalledWith(8)

    rerender(<EmojiRating label="How hard was that?" options={RPE_OPTIONS} value={8} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Hard/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Hard/ }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe('EmojiRatingDisplay', () => {
  it('shows the effort label with the number, nearest option for odd values', () => {
    render(<EmojiRatingDisplay wellbeing={4} rpe={7} />)
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText(/Moderate/)).toHaveTextContent('Moderate (7/10)')
  })
})
