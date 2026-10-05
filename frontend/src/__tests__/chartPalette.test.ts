import { describe, expect, it } from 'vitest'
import {
  activityColor,
  axisColor,
  categoricalColor,
  chartColor,
  gridColor,
  heatmapRamp,
  zoneColor,
} from '../lib/chartPalette'

describe('chartPalette', () => {
  it('falls back to the spec hex when the CSS variable is missing', () => {
    expect(chartColor('chart-strength')).toBe('#7E9B76')
    expect(axisColor()).toBe('#737A70')
    expect(gridColor()).toBe('#E8E4DA')
  })

  it('reads the CSS variable at runtime when defined', () => {
    document.documentElement.style.setProperty('--color-chart-running', '#123456')
    try {
      expect(chartColor('chart-running')).toBe('#123456')
      expect(activityColor('Running')).toBe('#123456')
    } finally {
      document.documentElement.style.removeProperty('--color-chart-running')
    }
    expect(chartColor('chart-running')).toBe('#D1A15D')
  })

  it('maps activity names to their token colour', () => {
    expect(activityColor('Running')).toBe('#D1A15D')
    expect(activityColor('Trail run')).toBe('#D1A15D')
    expect(activityColor('Walking')).toBe('#A58A76')
    expect(activityColor('Cycling')).toBe('#8297A5')
    expect(activityColor('Swimming')).toBe('#9B8DB6')
    expect(activityColor('Yoga')).toBe('#C98F8F')
    expect(activityColor('Pilates')).toBe('#C98F8F')
    expect(activityColor('Gym')).toBe('#7E9B76')
    expect(activityColor('Strength')).toBe('#7E9B76')
  })

  it('uses the categorical order for unknown activity names', () => {
    expect(activityColor('Rowing', 0)).toBe(categoricalColor(0))
    expect(activityColor('Rowing', 2)).toBe('#8297A5')
  })

  it('cycles the categorical palette after six colours', () => {
    expect(categoricalColor(0)).toBe('#7E9B76')
    expect(categoricalColor(1)).toBe('#D1A15D')
    expect(categoricalColor(6)).toBe(categoricalColor(0))
  })

  it('provides five HR zone colours and a four-step sage heatmap ramp', () => {
    expect([1, 2, 3, 4, 5].map((z) => zoneColor(z as 1 | 2 | 3 | 4 | 5))).toEqual([
      '#8297A5',
      '#7E9B76',
      '#D1A15D',
      '#C98F8F',
      '#C86F62',
    ])
    expect(heatmapRamp()).toEqual(['#E8E4DA', '#B8C9B2', '#7E9B76', '#4F6B52'])
  })
})
