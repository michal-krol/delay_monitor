import { describe, expect, it } from 'vitest'
import { expectedAt, isPastRow, realizedTime, timePresentation } from './boardTime'

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

describe('timePresentation — dominant useful time (D1)', () => {
  const NOW = new Date('2026-10-02T13:53:00+02:00').getTime()
  const base = { plannedAt: PLANNED, actualAt: null, delayMinutes: null, predictedAt: null, status: 'notStarted' as const }

  it('confirmed actual = fact "Faktycznie" with Plan line even when equal to plan', () => {
    const p = timePresentation({ ...base, actualAt: PLANNED, delayMinutes: 0, status: 'onTime' }, NOW)
    expect(p).toEqual({ kind: 'fact', at: PLANNED, label: 'Faktycznie', planAt: PLANNED, countdown: 'za 7 min' })
  })

  it('actualAt without delayMinutes (copy of plan) is not a fact', () => {
    const p = timePresentation({ ...base, actualAt: PLANNED, delayMinutes: null }, NOW)
    expect(p.kind).toBe('plan')
    expect(p.label).toBe('Plan')
    expect(p.planAt).toBeNull()
  })

  it('forecast = "Przew." with small Plan', () => {
    const at = '2026-10-02T14:05:00+02:00'
    expect(timePresentation({ ...base, predictedAt: at }, NOW)).toEqual({
      kind: 'forecast',
      at,
      label: 'Przew.',
      planAt: PLANNED,
      countdown: 'za 12 min',
    })
  })

  it('no realization = plan only, no planAt, label "Plan"', () => {
    expect(timePresentation(base, NOW)).toEqual({ kind: 'plan', at: PLANNED, label: 'Plan', planAt: null, countdown: 'za 7 min' })
  })

  it('cancelled never counts down and shows the plan time', () => {
    const p = timePresentation({ ...base, status: 'cancelled', predictedAt: '2026-10-02T14:05:00+02:00' }, NOW)
    expect(p).toEqual({ kind: 'plan', at: PLANNED, label: 'Plan', planAt: null, countdown: null })
  })

  it('stays silent about the countdown beyond the window', () => {
    expect(timePresentation({ ...base, predictedAt: '2026-10-02T15:30:00+02:00' }, NOW).countdown).toBeNull()
  })

  it('counts across midnight on timestamps, not HH:mm strings', () => {
    const lateNow = new Date('2026-10-02T23:55:00+02:00').getTime()
    const p = timePresentation({ ...base, plannedAt: '2026-10-02T23:58:00+02:00', predictedAt: '2026-10-03T00:02:00+02:00' }, lateNow)
    expect(p.countdown).toBe('za 7 min')
  })
})

describe('isPastRow', () => {
  const NOW = Date.parse('2026-10-01T12:10:00+02:00')
  const PLAN = '2026-10-01T12:00:00+02:00'
  it('a passed plan is past for confirmed or cancelled rows', () => {
    for (const status of ['onTime', 'delayed', 'cancelled', 'unknown'] as const) expect(isPastRow({ plannedAt: PLAN, status }, NOW)).toBe(true)
  })
  it('a train that has not left yet is never past (still awaited)', () => {
    for (const status of ['enRoute', 'notStarted'] as const) expect(isPastRow({ plannedAt: PLAN, status }, NOW)).toBe(false)
  })
  it('a future plan is not past', () => {
    expect(isPastRow({ plannedAt: '2026-10-01T12:20:00+02:00', status: 'onTime' }, NOW)).toBe(false)
  })
})
