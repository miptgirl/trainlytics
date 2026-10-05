import { describe, it, expect } from 'vitest'
import { getStartUrl } from '../lib/planStart'
import type { PlannedSessionOut } from '../lib/planApi'

function make(over: Partial<PlannedSessionOut>): PlannedSessionOut {
  return {
    id: 7,
    planned_date: '2026-10-05',
    session_type: 'strength',
    template_id: null,
    activity_type_id: null,
    title: null,
    notes: null,
    skip_note: null,
    display_order: 0,
    segments: [],
    status: 'planned',
    matched_session_id: null,
    ...over,
  }
}

describe('getStartUrl', () => {
  it('opens the strength form with the template', () => {
    expect(getStartUrl(make({ template_id: 3 }), '2026-10-05')).toBe('/log?type=strength&templateId=3')
  })

  it('adds the planned date for a skipped strength session', () => {
    expect(getStartUrl(make({ template_id: 3, status: 'skipped' }), '2026-10-05')).toBe(
      '/log?type=strength&templateId=3&date=2026-10-05T10:00',
    )
  })

  it('falls back to a blank strength form without a template', () => {
    expect(getStartUrl(make({}), '2026-10-05')).toBe('/log?type=strength')
  })

  it('keeps the planned date for a skipped session without a template', () => {
    expect(getStartUrl(make({ status: 'skipped' }), '2026-10-05')).toBe(
      '/log?type=strength&date=2026-10-05T10:00',
    )
  })

  it('links a cardio session to its plan', () => {
    expect(getStartUrl(make({ session_type: 'cardio' }), '2026-09-28')).toBe(
      '/log?type=cardio&plannedSessionId=7&weekStart=2026-09-28',
    )
  })
})
