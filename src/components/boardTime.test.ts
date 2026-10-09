import { describe, expect, it } from 'vitest'
import { expectedAt, realizedTime, timeNote } from './boardTime'

const PLANNED = '2026-10-02T14:00:00+02:00'

describe('realizedTime', () => {
  it('a confirmed actual time is a fact and wins over a forecast', () => {
    expect(realizedTime({ actualAt: '2026-10-02T14:04:00+02:00', delayMinutes: 4, predictedAt: '2026-10-02T14:09:00+02:00' })).toEqual({
      at: '2026-10-02T14:04:00+02:00',
      kind: 'fact',
    })
  })

  it('an actual time without a delay (PKP copy of the plan, AGENTS #2) is not a fact', () => {
    expect(realizedTime({ actualAt: PLANNED, delayMinutes: null, predictedAt: null })).toBeNull()
    expect(realizedTime({ actualAt: PLANNED, delayMinutes: null, predictedAt: '2026-10-02T14:12:00+02:00' })).toEqual({
      at: '2026-10-02T14:12:00+02:00',
      kind: 'forecast',
    })
  })
})

describe('expectedAt', () => {
  it('counts to the forecast when there is one', () => {
    expect(expectedAt({ plannedAt: PLANNED, actualAt: null, delayMinutes: null, predictedAt: '2026-10-02T14:12:00+02:00' })).toBe(
      '2026-10-02T14:12:00+02:00'
    )
  })

  it('falls back to the planned time', () => {
    expect(expectedAt({ plannedAt: PLANNED, actualAt: null, delayMinutes: null })).toBe(PLANNED)
  })
})

describe('timeNote — podpis pod godziną („Prognoza · za 7 min”)', () => {
  const NOW = new Date('2026-10-02T13:53:00+02:00').getTime()
  const base = { plannedAt: PLANNED, actualAt: null, delayMinutes: null, predictedAt: null, status: 'notStarted' as const }

  it('names a forecast and counts down to it', () => {
    expect(timeNote({ ...base, predictedAt: '2026-10-02T14:00:00+02:00' }, NOW)).toBe('Prognoza · za 7 min')
  })

  it('names a forecast even beyond the countdown window', () => {
    expect(timeNote({ ...base, predictedAt: '2026-10-02T15:30:00+02:00' }, NOW)).toBe('Prognoza')
  })

  it('without a realization it is the bare plan countdown', () => {
    expect(timeNote(base, NOW)).toBe('za 7 min')
  })

  it('a fact is not labelled a forecast', () => {
    expect(timeNote({ ...base, actualAt: '2026-10-02T13:50:00+02:00', delayMinutes: 0, status: 'onTime' }, NOW)).toBeNull()
  })

  it('a cancelled train gets no countdown', () => {
    expect(timeNote({ ...base, status: 'cancelled' }, NOW)).toBeNull()
  })

  it('a cancelled train is never labelled a forecast, even with a predicted time (PR #144 review)', () => {
    expect(timeNote({ ...base, status: 'cancelled', predictedAt: '2026-10-02T14:00:00+02:00' }, NOW)).toBeNull()
  })

  it('counts across midnight on timestamps, not HH:mm strings', () => {
    const lateNow = new Date('2026-10-02T23:55:00+02:00').getTime()
    expect(timeNote({ ...base, plannedAt: '2026-10-02T23:58:00+02:00', predictedAt: '2026-10-03T00:02:00+02:00' }, lateNow)).toBe(
      'Prognoza · za 7 min'
    )
  })
})
