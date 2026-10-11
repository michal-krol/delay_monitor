import { describe, expect, it } from 'vitest'
import type { TrainDetailStop } from '@/lib/board/trainDetail'
import { describeStopTime, stopEvent } from './stopTime'

const NOW = Date.parse('2026-08-01T10:00:00.000Z')

function stop(overrides: Partial<TrainDetailStop> = {}): TrainDetailStop {
  return {
    stationId: '7500',
    stationName: 'Gdańsk Główny',
    plannedArrival: '2026-08-01T10:00:00.000Z',
    actualArrival: null,
    arrivalDelayMinutes: null,
    plannedDeparture: '2026-08-01T10:02:00.000Z',
    actualDeparture: null,
    departureDelayMinutes: null,
    isCancelled: false,
    isConfirmed: false,
    platform: null,
    track: null,
    hasTrainStarted: false,
    estimatedDelayMinutes: null,
    predictedArrival: null,
    predictedDeparture: null,
    disruptionMessages: [],
    stopMinutes: null,
    stopTypeName: null,
    ...overrides,
  }
}

describe('describeStopTime', () => {
  it('confirmed stop with delay = fact (Faktycznie) + planAt', () => {
    const confirmed = stop({
      isConfirmed: true,
      actualDeparture: '2026-08-01T10:09:00.000Z',
      departureDelayMinutes: 7,
    })
    expect(describeStopTime(confirmed, 'delayed', NOW, 'departure')).toEqual({
      kind: 'fact',
      label: 'Faktycznie',
      at: '2026-08-01T10:09:00.000Z',
      planAt: '2026-08-01T10:02:00.000Z',
    })
  })

  it('actualAt copied from plan without isConfirmed is not a fact (Plan)', () => {
    const copied = stop({ isConfirmed: false, actualDeparture: '2026-08-01T10:02:00.000Z', departureDelayMinutes: 0 })
    expect(describeStopTime(copied, 'notStarted', NOW, 'departure')).toEqual({
      kind: 'plan',
      label: 'Plan',
      at: '2026-08-01T10:02:00.000Z',
      planAt: null,
    })
  })

  it('unconfirmed stop with PKP prediction = forecast (Przew.)', () => {
    const predicted = stop({ predictedDeparture: '2026-08-01T10:20:00.000Z' })
    expect(describeStopTime(predicted, 'enRoute', NOW, 'departure')).toEqual({
      kind: 'forecast',
      label: 'Przew.',
      at: '2026-08-01T10:20:00.000Z',
      planAt: '2026-08-01T10:02:00.000Z',
    })
  })

  it('cancelled stop = plan only', () => {
    const cancelled = stop({ isCancelled: true, predictedDeparture: '2026-08-01T10:20:00.000Z' })
    expect(describeStopTime(cancelled, 'cancelled', NOW, 'departure')).toEqual({
      kind: 'plan',
      label: 'Plan',
      at: '2026-08-01T10:02:00.000Z',
      planAt: null,
    })
  })

  describe('no planned time (route not matched)', () => {
    const unmatched = { plannedArrival: null, plannedDeparture: null }

    it('confirmed actual → fact', () => {
      const confirmed = stop({ ...unmatched, isConfirmed: true, actualDeparture: '2026-08-01T10:05:00.000Z' })
      expect(describeStopTime(confirmed, 'unknown', NOW, 'departure')).toEqual({
        kind: 'fact',
        label: 'Faktycznie',
        at: '2026-08-01T10:05:00.000Z',
        planAt: null,
      })
    })

    it('prediction → forecast', () => {
      const predicted = stop({ ...unmatched, predictedArrival: '2026-08-01T10:30:00.000Z' })
      expect(describeStopTime(predicted, 'enRoute', NOW, 'arrival')).toEqual({
        kind: 'forecast',
        label: 'Przew.',
        at: '2026-08-01T10:30:00.000Z',
        planAt: null,
      })
    })

    it('nothing → at null', () => {
      expect(describeStopTime(stop(unmatched), 'unknown', NOW, 'departure')).toEqual({
        kind: 'plan',
        label: 'Plan',
        at: null,
        planAt: null,
      })
    })

    it('unconfirmed raw actual is never shown', () => {
      const raw = stop({ ...unmatched, actualDeparture: '2026-08-01T20:15:00.000Z' })
      expect(describeStopTime(raw, 'unknown', NOW, 'departure').at).toBeNull()
    })
  })

  it('arrival vs departure event picks the matching fields', () => {
    const both = stop({
      isConfirmed: true,
      actualArrival: '2026-08-01T10:04:00.000Z',
      arrivalDelayMinutes: 4,
      actualDeparture: '2026-08-01T10:09:00.000Z',
      departureDelayMinutes: 7,
    })
    expect(describeStopTime(both, 'delayed', NOW, 'arrival')).toMatchObject({
      at: '2026-08-01T10:04:00.000Z',
      planAt: '2026-08-01T10:00:00.000Z',
    })
    expect(describeStopTime(both, 'delayed', NOW, 'departure')).toMatchObject({
      at: '2026-08-01T10:09:00.000Z',
      planAt: '2026-08-01T10:02:00.000Z',
    })
  })
})

describe('stopEvent', () => {
  it('is departure when a planned or actual departure exists, otherwise arrival', () => {
    expect(stopEvent(stop())).toBe('departure')
    expect(stopEvent(stop({ plannedDeparture: null, actualDeparture: '2026-08-01T10:09:00.000Z' }))).toBe('departure')
    expect(stopEvent(stop({ plannedDeparture: null }))).toBe('arrival')
  })
})
