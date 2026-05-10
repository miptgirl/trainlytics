const KEYS = {
  strength: 'trainlytics_draft_strength',
  cardio: 'trainlytics_draft_cardio',
} as const

type DraftType = keyof typeof KEYS

export function saveDraft(type: DraftType, data: object): void {
  try {
    localStorage.setItem(KEYS[type], JSON.stringify(data))
  } catch {
    // localStorage unavailable (private browsing quota, etc.) — silently ignore
  }
}

export function loadDraft(type: DraftType): object | null {
  try {
    const raw = localStorage.getItem(KEYS[type])
    if (raw === null) return null
    return JSON.parse(raw) as object
  } catch {
    return null
  }
}

export function clearDraft(type: DraftType): void {
  try {
    localStorage.removeItem(KEYS[type])
  } catch {
    // ignore
  }
}
