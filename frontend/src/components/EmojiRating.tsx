interface EmojiOption {
  emoji: string
  label: string
}

interface EmojiRatingProps {
  label: string
  options: EmojiOption[]
  value: number | null
  onChange: (val: number | null) => void
}

export function EmojiRating({ label, options, value, onChange }: EmojiRatingProps) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="flex gap-1 justify-between">
        {options.map((opt, i) => {
          const grade = i + 1
          const selected = value === grade
          return (
            <button
              key={grade}
              type="button"
              onClick={() => onChange(selected ? null : grade)}
              className={`flex flex-col items-center gap-0.5 flex-1 py-1.5 rounded-lg border transition-colors ${
                selected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <span className={`text-2xl leading-none ${selected ? '' : 'opacity-40'}`}>
                {opt.emoji}
              </span>
              <span className={`text-[10px] leading-tight text-center ${selected ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const WELLBEING_OPTIONS: EmojiOption[] = [
  { emoji: '😫', label: 'Exhausted' },
  { emoji: '😞', label: 'Not great' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😄', label: 'Great' },
]

export const RPE_OPTIONS: EmojiOption[] = [
  { emoji: '😫', label: 'All-out' },
  { emoji: '😞', label: 'Hard' },
  { emoji: '😐', label: 'Moderate' },
  { emoji: '🙂', label: 'Easy' },
  { emoji: '😄', label: 'Very easy' },
]

interface EmojiDisplayProps {
  wellbeing: number | null
  rpe: number | null
}

export function EmojiRatingDisplay({ wellbeing, rpe }: EmojiDisplayProps) {
  if (wellbeing == null && rpe == null) return null
  return (
    <div className="flex gap-4">
      {wellbeing != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Feeling</span>
          <span className="text-lg leading-none">{WELLBEING_OPTIONS[wellbeing - 1].emoji}</span>
          <span className="text-xs text-gray-700">{WELLBEING_OPTIONS[wellbeing - 1].label}</span>
        </div>
      )}
      {rpe != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Effort</span>
          <span className="text-lg leading-none">{RPE_OPTIONS[rpe - 1].emoji}</span>
          <span className="text-xs text-gray-700">{RPE_OPTIONS[rpe - 1].label}</span>
        </div>
      )}
    </div>
  )
}
