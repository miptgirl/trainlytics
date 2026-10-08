import type { EmojiOption } from './EmojiRating'

export const WELLBEING_OPTIONS: EmojiOption[] = [
  { value: 1, emoji: '😫', label: 'Exhausted' },
  { value: 2, emoji: '😞', label: 'Not great' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
]

/** Session RPE on the 1–10 scale (10 = maximal effort), easy → hard. */
export const RPE_OPTIONS: EmojiOption[] = [
  { value: 2, emoji: '😄', label: 'Very easy' },
  { value: 4, emoji: '🙂', label: 'Easy' },
  { value: 6, emoji: '😐', label: 'Moderate' },
  { value: 8, emoji: '😞', label: 'Hard' },
  { value: 10, emoji: '😫', label: 'All-out' },
]

/**
 * The option for `value`, or the nearest one when no option has that value
 * (e.g. an odd session RPE). Ties go to the lower option, matching how the
 * RPE migration's downgrade rounds odd values.
 */
export function optionForValue(options: EmojiOption[], value: number): EmojiOption {
  let best = options[0]
  for (const opt of options) {
    if (Math.abs(opt.value - value) < Math.abs(best.value - value)) best = opt
  }
  return best
}
