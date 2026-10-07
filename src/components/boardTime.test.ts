import { describe, expect, it } from 'vitest'
import { expectedAt, realizedTime } from './boardTime'

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
