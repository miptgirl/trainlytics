import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveDraft,
  loadDraft,
  clearDraft,
  parseCardioDraft,
  serializeCardioDraft,
  CARDIO_DRAFT_VERSION,
} from '../lib/draftUtils'

const store: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  })
})

describe('saveDraft / loadDraft', () => {
  it('round-trips a strength draft', () => {
    const draft = { title: 'Push Day', exercises: [{ name: 'Bench' }], templateId: 7 }
    saveDraft('strength', draft)
    expect(loadDraft('strength')).toEqual(draft)
  })

  it('round-trips a cardio draft', () => {
    const draft = { title: 'Morning Run', segments: [{ distance: 5 }] }
    saveDraft('cardio', draft)
    expect(loadDraft('cardio')).toEqual(draft)
  })

  it('round-trips wellbeing and rpe values in a strength draft', () => {
    const draft = { title: 'Push Day', wellbeing: 4, rpe: 2, exercises: [] }
    saveDraft('strength', draft)
    const restored = loadDraft('strength') as Record<string, unknown>
    expect(restored.wellbeing).toBe(4)
    expect(restored.rpe).toBe(2)
  })

  it('round-trips wellbeing and rpe values in a cardio draft', () => {
    const draft = { title: 'Morning Run', wellbeing: 3, rpe: null, segments: [] }
    saveDraft('cardio', draft)
    const restored = loadDraft('cardio') as Record<string, unknown>
    expect(restored.wellbeing).toBe(3)
    expect(restored.rpe).toBeNull()
  })

  it('strength and cardio drafts are stored independently', () => {
    saveDraft('strength', { title: 'Legs' })
    saveDraft('cardio', { title: 'Bike' })
    expect((loadDraft('strength') as Record<string, unknown>).title).toBe('Legs')
    expect((loadDraft('cardio') as Record<string, unknown>).title).toBe('Bike')
  })

  it('returns null when no draft exists', () => {
    expect(loadDraft('strength')).toBeNull()
    expect(loadDraft('cardio')).toBeNull()
  })

  it('overwrites an existing draft', () => {
    saveDraft('strength', { title: 'Old' })
    saveDraft('strength', { title: 'New' })
    expect((loadDraft('strength') as Record<string, unknown>).title).toBe('New')
  })
})

describe('clearDraft', () => {
  it('removes the draft so loadDraft returns null', () => {
    saveDraft('strength', { title: 'Push Day' })
    clearDraft('strength')
    expect(loadDraft('strength')).toBeNull()
  })

  it('clearing one type does not affect the other', () => {
    saveDraft('strength', { title: 'Legs' })
    saveDraft('cardio', { title: 'Run' })
    clearDraft('strength')
    expect(loadDraft('strength')).toBeNull()
    expect(loadDraft('cardio')).not.toBeNull()
  })

  it('is a no-op when no draft exists', () => {
    expect(() => clearDraft('cardio')).not.toThrow()
  })
})

describe('error handling', () => {
  it('loadDraft returns null on malformed JSON', () => {
    store['trainlytics_draft_strength'] = '{bad json'
    expect(loadDraft('strength')).toBeNull()
  })

  it('saveDraft does not throw when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
    })
    expect(() => saveDraft('cardio', { title: 'Run' })).not.toThrow()
  })
})

describe('cardio draft versioning', () => {
  it('stores the version and keeps rpe on round-trip', () => {
    saveDraft('cardio', serializeCardioDraft({ title: 'Run', wellbeing: 3, rpe: 8 }))
    const raw = loadDraft('cardio') as Record<string, unknown>
    expect(raw.version).toBe(CARDIO_DRAFT_VERSION)
    expect(parseCardioDraft(raw)).toEqual({ title: 'Run', wellbeing: 3, rpe: 8 })
  })

  it('drops rpe from an unversioned draft (old inverted 1–5 scale)', () => {
    expect(parseCardioDraft({ title: 'Run', wellbeing: 3, rpe: 1 })).toEqual({
      title: 'Run',
      wellbeing: 3,
      rpe: null,
    })
  })

  it.each([7.5, 0, 11, '8'])('loads a versioned draft rpe of %s as null (not an integer 1–10)', (rpe) => {
    expect(parseCardioDraft({ version: CARDIO_DRAFT_VERSION, title: 'Run', rpe })).toEqual({ title: 'Run', rpe: null })
  })

  it('returns null for a missing draft', () => {
    expect(parseCardioDraft(null)).toBeNull()
  })
})
