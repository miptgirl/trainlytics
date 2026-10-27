import { CheckIcon, PlusIcon } from './icons'

/**
 * Under the editor right after an exercise's last set moved workout mode on:
 * that exercise and today's sets, a tap to go back to it (its done card), and
 * One more set for it. The page decides how long it stays.
 */
export function DoneStrip({
  name,
  today,
  onOpen,
  onOneMore,
}: {
  name: string
  today: string | null
  onOpen: () => void
  onOneMore: () => void
}) {
  return (
    <section
      aria-label="Finished exercise"
      className="rounded-2xl border border-border bg-surface p-1.5 flex items-center gap-2"
    >
      <button
        type="button"
        onClick={onOpen}
        // Starts with the visible text, so a voice command naming it still finds it
        aria-label={`${name} done${today ? `, ${today}` : ''}. Go back to it`}
        className="flex-1 min-w-0 min-h-11 rounded-xl px-2 py-1 flex flex-col justify-center text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-text">
          <CheckIcon size={16} strokeWidth={2.8} className="text-success-text" />
          <span className="min-w-0 break-words">{name} done</span>
        </span>
        {today && <span className="mt-0.5 text-xs text-text-muted-strong break-words">{today}</span>}
      </button>
      <button
        type="button"
        onClick={onOneMore}
        aria-label={`One more set of ${name}`}
        className="shrink-0 min-h-11 px-3 rounded-xl border border-primary-dark bg-surface text-primary-dark text-sm font-semibold flex items-center gap-1.5"
      >
        <PlusIcon size={16} />
        One more set
      </button>
    </section>
  )
}
