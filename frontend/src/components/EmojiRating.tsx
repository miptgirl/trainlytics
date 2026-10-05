import { RPE_OPTIONS, WELLBEING_OPTIONS } from './emojiRatingOptions'

export interface EmojiOption {
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
  return (
    <div className="flex gap-4">
      {wellbeing != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted-strong">Feeling</span>
          <span className="text-lg leading-none">{WELLBEING_OPTIONS[wellbeing - 1].emoji}</span>
          <span className="text-xs text-text">{WELLBEING_OPTIONS[wellbeing - 1].label}</span>
        </div>
      )}
      {rpe != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted-strong">Effort</span>
          <span className="text-lg leading-none">{RPE_OPTIONS[rpe - 1].emoji}</span>
          <span className="text-xs text-text">{RPE_OPTIONS[rpe - 1].label}</span>
        </div>
      )}
    </div>
  )
}
