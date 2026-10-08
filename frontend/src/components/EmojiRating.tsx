import { RPE_OPTIONS, WELLBEING_OPTIONS, optionForValue } from './emojiRatingOptions'

export interface EmojiOption {
  /** Stored value; options need not be consecutive (RPE emits 2/4/6/8/10). */
  value: number
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
      <p className="text-sm font-medium text-text mb-2">{label}</p>
      <div className="flex gap-1 justify-between">
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : opt.value)}
              className={`flex flex-col items-center gap-0.5 flex-1 py-1.5 rounded-lg border transition-colors ${
                selected
                  ? 'border-primary bg-primary-tint'
                  : 'border-transparent hover:bg-bg'
              }`}
            >
              <span className={`text-2xl leading-none ${selected ? '' : 'opacity-40'}`}>
                {opt.emoji}
              </span>
              <span className={`text-[10px] leading-tight text-center ${selected ? 'text-primary-dark font-medium' : 'text-text-muted-strong'}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface EmojiDisplayProps {
  wellbeing: number | null
  rpe: number | null
}

export function EmojiRatingDisplay({ wellbeing, rpe }: EmojiDisplayProps) {
  if (wellbeing == null && rpe == null) return null
  const feeling = wellbeing != null ? optionForValue(WELLBEING_OPTIONS, wellbeing) : null
  const effort = rpe != null ? optionForValue(RPE_OPTIONS, rpe) : null
  return (
    <div className="flex gap-4">
      {feeling && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted-strong">Feeling</span>
          <span className="text-lg leading-none">{feeling.emoji}</span>
          <span className="text-xs text-text">{feeling.label}</span>
        </div>
      )}
      {effort && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted-strong">Effort</span>
          <span className="text-lg leading-none">{effort.emoji}</span>
          <span className="text-xs text-text">
            {effort.label} <span className="text-text-muted-strong tabular-nums">({rpe}/10)</span>
          </span>
        </div>
      )}
    </div>
  )
}
