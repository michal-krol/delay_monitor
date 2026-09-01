import { describe, expect, it } from 'vitest'
import { formatClockTime } from './format'

describe('formatClockTime', () => {
  it('formats an ISO timestamp in Warsaw time regardless of the runner timezone', () => {
    // 14:07+02:00 = 12:07 UTC = 14:07 Warszawa (CEST). Wynik jest ten sam
    // pod TZ=Europe/Warsaw i pod TZ=UTC -- o to chodzi w wymuszeniu strefy.
    expect(formatClockTime('2026-08-01T14:07:00+02:00')).toBe('14:07')
    // Ten sam moment podany jako UTC.
    expect(formatClockTime('2026-08-01T12:07:00Z')).toBe('14:07')
  })

  it('passes null through as null', () => {
    expect(formatClockTime(null)).toBeNull()
  })
})
