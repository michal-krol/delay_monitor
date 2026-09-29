import { describe, expect, it } from 'vitest'
import { BORDER_COLOR, GLOW_COLOR, statusTint } from './realizationColors'
import type { RealizationStatus } from '@/lib/board/realization'

const STATUSES: RealizationStatus[] = ['onTime', 'delayed', 'cancelled', 'unknown', 'notStarted', 'enRoute']

describe('realizationColors', () => {
  it('statusTint dilutes the status token instead of repeating its colour', () => {
    expect(statusTint('delayed', 5)).toBe('color-mix(in srgb, var(--status-delayed-bg) 5%, transparent)')
  })

  it('glow of every status derives from its --status-*-bg token', () => {
    for (const status of STATUSES) expect(GLOW_COLOR[status]).toContain(`var(--status-${status}-bg)`)
  })

  it('border derives from the status token; unknown falls back to the surface border', () => {
    for (const status of STATUSES.filter((s) => s !== 'unknown')) {
      expect(BORDER_COLOR[status]).toContain(`var(--status-${status}-bg)`)
    }
    expect(BORDER_COLOR.unknown).toBe('var(--surface-border)')
  })
})
