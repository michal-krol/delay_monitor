import { describe, expect, it } from 'vitest'
import { hasTrainStartedFromStatus, resolveDelayMinutes, resolveStopStatus } from './realization'

describe('resolveStopStatus', () => {
  it('cancelled wins over everything else, even a confirmed on-time delay', () => {
    expect(resolveStopStatus({ isCancelled: true, isConfirmed: true, delayMinutes: 0 })).toBe('cancelled')
  })

  it('cancelled wins over an unconfirmed stop too', () => {
    expect(resolveStopStatus({ isCancelled: true, isConfirmed: false, delayMinutes: null })).toBe('cancelled')
  })

  it('an unconfirmed, non-cancelled stop is notStarted, regardless of trainStatus (there is no trainStatus parameter -- isConfirmed alone decides)', () => {
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: false, delayMinutes: null })).toBe('notStarted')
  })

  it('reproduces the exact production case (R1 91342, KM): unconfirmed stop with a delay that only exists because actual echoed planned', () => {
    // PKP wpisało 0 jako "opóźnienie" (bo actual == planned), ale isConfirmed
    // jest false -- musi to nadal być notStarted, nie onTime.
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: false, delayMinutes: 0 })).toBe('notStarted')
  })

  it('a confirmed stop with no resolvable delay is unknown', () => {
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: true, delayMinutes: null })).toBe('unknown')
  })

  it('a confirmed stop with 0 minutes delay is onTime', () => {
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: true, delayMinutes: 0 })).toBe('onTime')
  })

  it('a confirmed stop with >=1 minute delay is delayed', () => {
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: true, delayMinutes: 1 })).toBe('delayed')
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: true, delayMinutes: 25 })).toBe('delayed')
  })

  it('an unconfirmed stop defaults to notStarted when hasTrainStarted is omitted', () => {
    expect(resolveStopStatus({ isCancelled: false, isConfirmed: false, delayMinutes: null })).toBe('notStarted')
  })

  it('an unconfirmed stop is enRoute when the train already left an earlier stop', () => {
    expect(
      resolveStopStatus({ isCancelled: false, isConfirmed: false, delayMinutes: null, hasTrainStarted: true })
    ).toBe('enRoute')
  })

  it('an unconfirmed stop stays notStarted when hasTrainStarted is explicitly false', () => {
    expect(
      resolveStopStatus({ isCancelled: false, isConfirmed: false, delayMinutes: null, hasTrainStarted: false })
    ).toBe('notStarted')
  })

  it('cancelled wins over hasTrainStarted too', () => {
    expect(
      resolveStopStatus({ isCancelled: true, isConfirmed: false, delayMinutes: null, hasTrainStarted: true })
    ).toBe('cancelled')
  })
})

describe('resolveDelayMinutes', () => {
  it('is null when the stop is not confirmed, even if the API supplied an explicit delay figure', () => {
    // Nie powinno się zdarzyć naprawdę (niepotwierdzony przystanek nie ma
    // pól opóźnienia na żywym API), ale gdyby się zdarzyło, isConfirmed ma
    // pierwszeństwo -- nigdy nie ufamy liczbie z niepotwierdzonych danych.
    expect(resolveDelayMinutes(5, false, '2026-08-01T10:00:00Z', '2026-08-01T10:05:00Z')).toBeNull()
  })

  it('is null when not confirmed and actual echoes planned exactly (the real production shape)', () => {
    expect(resolveDelayMinutes(null, false, '2026-08-06T17:54:00.000Z', '2026-08-06T17:54:00.000Z')).toBeNull()
  })

  it('prefers the API-supplied delay figure when confirmed', () => {
    expect(resolveDelayMinutes(7, true, '2026-08-01T10:00:00Z', '2026-08-01T10:03:00Z')).toBe(7)
  })

  it('computes the delay from planned vs actual when confirmed and the API gave no figure', () => {
    expect(resolveDelayMinutes(null, true, '2026-08-01T10:00:00Z', '2026-08-01T10:07:00Z')).toBe(7)
  })

  it('rounds to the nearest minute', () => {
    expect(resolveDelayMinutes(null, true, '2026-08-01T10:00:00Z', '2026-08-01T10:00:31Z')).toBe(1)
    expect(resolveDelayMinutes(null, true, '2026-08-01T10:00:00Z', '2026-08-01T10:00:29Z')).toBe(0)
  })

  it('is null when confirmed but either side of the comparison is missing', () => {
    expect(resolveDelayMinutes(null, true, null, '2026-08-01T10:00:00Z')).toBeNull()
    expect(resolveDelayMinutes(null, true, '2026-08-01T10:00:00Z', null)).toBeNull()
  })
})

describe('hasTrainStartedFromStatus', () => {
  it('is true for InProgress and Completed', () => {
    expect(hasTrainStartedFromStatus('P')).toBe(true)
    expect(hasTrainStartedFromStatus('C')).toBe(true)
  })

  it('is false for NotStarted, PartialCancelled, an unrecognised value, and null', () => {
    // PartialCancelled (Q) jest świadomie wykluczone -- może być znane z góry,
    // zanim pociąg w ogóle wyjechał (patrz komentarz w realization.ts).
    expect(hasTrainStartedFromStatus('S')).toBe(false)
    expect(hasTrainStartedFromStatus('Q')).toBe(false)
    expect(hasTrainStartedFromStatus('X')).toBe(false)
    expect(hasTrainStartedFromStatus('something-new-from-a-future-api-version')).toBe(false)
    expect(hasTrainStartedFromStatus(null)).toBe(false)
  })
})
