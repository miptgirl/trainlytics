import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from '../lib/draftUtils'

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
