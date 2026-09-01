import { describe, expect, it } from 'vitest'
import { formatClockTime } from './format'

describe('formatClockTime', () => {
  it('formats an ISO timestamp as two-digit HH:MM', () => {
    // Konkretna godzina zależy od strefy widza (świadomie -- patrz format.ts),
    // więc sprawdzamy kształt, nie wartość. CI biegnie i w Europe/Warsaw, i UTC.
    expect(formatClockTime('2026-08-01T14:07:00+02:00')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('passes null through as null', () => {
    expect(formatClockTime(null)).toBeNull()
  })
})
