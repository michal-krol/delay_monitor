import { describe, expect, it } from 'vitest'
import { formatAge, formatAgo, formatClockTime, formatDuration, formatSecondsOfDay } from './format'

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

describe('formatSecondsOfDay', () => {
  it('formats whole minutes as HH:MM', () => {
    expect(formatSecondsOfDay(0)).toBe('00:00')
    expect(formatSecondsOfDay(86399)).toBe('23:59')
  })

  it('wraps at 24h (GTFS times after midnight run past 86400)', () => {
    expect(formatSecondsOfDay(86400)).toBe('00:00')
    expect(formatSecondsOfDay(86400 + 60)).toBe('00:01')
  })
})

describe('formatAge', () => {
  it('renders minutes under an hour as "N min"', () => {
    expect(formatAge(0)).toBe('0 min')
    expect(formatAge(59 * 60_000)).toBe('59 min')
  })

  it('renders an hour or more as "N h M min"', () => {
    expect(formatAge(60 * 60_000)).toBe('1 h 0 min')
    expect(formatAge(90 * 60_000)).toBe('1 h 30 min')
  })
})

describe('formatAgo', () => {
  it('renders under 5 s as "przed chwilą"', () => {
    expect(formatAgo(0)).toBe('przed chwilą')
    expect(formatAgo(4)).toBe('przed chwilą')
  })

  it('renders under 60 s as "N s temu"', () => {
    expect(formatAgo(5)).toBe('5 s temu')
    expect(formatAgo(59)).toBe('59 s temu')
  })

  it('renders under 90 min as "N min temu"', () => {
    expect(formatAgo(60)).toBe('1 min temu')
    expect(formatAgo(89 * 60)).toBe('89 min temu')
  })

  it('renders 90 min or more as "N h temu"', () => {
    expect(formatAgo(90 * 60)).toBe('2 h temu')
  })

  it('clamps a negative age (clock skew) to zero instead of going negative', () => {
    expect(formatAgo(-5)).toBe('przed chwilą')
  })
})

describe('formatDuration', () => {
  it('renders minutes under an hour as "N min"', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(59)).toBe('59 min')
  })

  it('renders whole hours as "N h"', () => {
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(125)).toBe('2 h 5 min')
  })
})
