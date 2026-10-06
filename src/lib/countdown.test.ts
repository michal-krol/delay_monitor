import { describe, expect, it } from 'vitest'
import { countdownLabel, minutesUntil } from './countdown'

const NOW = Date.parse('2026-10-02T14:00:00+02:00')
const at = (minutes: number): string => new Date(NOW + minutes * 60_000).toISOString()

describe('minutesUntil', () => {
  it('rounds the difference to whole minutes, negative in the past', () => {
    expect(minutesUntil(NOW, NOW)).toBe(0)
    expect(minutesUntil(NOW, NOW + 5 * 60_000)).toBe(5)
    expect(minutesUntil(NOW, NOW - 3 * 60_000)).toBe(-3)
    expect(minutesUntil(NOW, NOW + 89_000)).toBe(1)
  })
})

describe('countdownLabel', () => {
  it('says „za N min" for a departure within the hour', () => {
    expect(countdownLabel(NOW, at(5))).toBe('za 5 min')
  })

  it('stays silent under a minute — never „za 0 min"', () => {
    expect(countdownLabel(NOW, at(0.4))).toBeNull()
  })

  it('stays silent for the past', () => {
    expect(countdownLabel(NOW, at(-3))).toBeNull()
  })

  it('stays silent from 60 min (59.5 rounds to 60)', () => {
    expect(countdownLabel(NOW, at(59.5))).toBeNull()
    expect(countdownLabel(NOW, at(59))).toBe('za 59 min')
  })

  it('shows hours when the caller lifts the ceiling', () => {
    expect(countdownLabel(NOW, at(125), Infinity)).toBe('za 2 h 5 min')
  })

  it('reads zoned ISO timestamps as instants (same result for +02:00 and Z)', () => {
    expect(countdownLabel(NOW, '2026-10-02T14:10:00+02:00')).toBe('za 10 min')
    expect(countdownLabel(NOW, '2026-10-02T12:10:00Z')).toBe('za 10 min')
  })
})
