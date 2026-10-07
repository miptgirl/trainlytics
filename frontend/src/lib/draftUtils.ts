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

/**
 * Cardio drafts are the raw form values plus `version`. Version 2 stores
 * session `rpe` on the 1–10 scale; older drafts (no version) had the inverted
 * 1–5 scale, so their `rpe` is dropped on load.
 */
export const CARDIO_DRAFT_VERSION = 2

export function serializeCardioDraft<T extends object>(values: T): T & { version: number } {
  return { ...values, version: CARDIO_DRAFT_VERSION }
}

/** Form values from a stored cardio draft (without `version`); null when it is not an object. */
export function parseCardioDraft<T extends object>(raw: object | null): T | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { version, ...values } = raw as Record<string, unknown>
  const v = typeof version === 'number' ? version : 1
  return (v >= CARDIO_DRAFT_VERSION ? values : { ...values, rpe: null }) as T
}
