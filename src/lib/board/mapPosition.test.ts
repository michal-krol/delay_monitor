import { describe, expect, it } from 'vitest'
import { resolveInterpolatedPosition, type TrainDetailStopWithCoords } from './mapPosition'

function stop(overrides: Partial<TrainDetailStopWithCoords> & { stationId: string }): TrainDetailStopWithCoords {
  return {
    stationName: overrides.stationId,
    plannedArrival: null,
    actualArrival: null,
    arrivalDelayMinutes: null,
    plannedDeparture: null,
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
    lat: null,
    lon: null,
    ...overrides,
  }
}

const D = (iso: string) => new Date(iso)

describe('resolveInterpolatedPosition', () => {
  it('interpolates between the confirmed anchor and the next stop, offset by the anchor delay', () => {
    const stops = [
      stop({
        stationId: 'A',
        isConfirmed: true,
        plannedDeparture: '2026-08-01T10:00:00.000Z',
        actualDeparture: '2026-08-01T10:10:00.000Z',
        departureDelayMinutes: 10,
        lat: 50,
        lon: 20,
      }),
      stop({ stationId: 'B', plannedArrival: '2026-08-01T11:00:00.000Z', lat: 51, lon: 21 }),
    ]
    // plan 10:00 + 10 min opóźnienia (actualDeparture - plannedDeparture) = start 10:10; koniec 11:00+10=11:10; 10:40 -> ułamek 0.5
    const result = resolveInterpolatedPosition(stops, 'P', D('2026-08-01T10:40:00.000Z'))
    expect(result).toEqual({ lat: 50.5, lon: 20.5 })
  })

  it('returns null before departure -- nothing confirmed, no schedule projection window yet (mirrors mock train 107)', () => {
    const stops = [
      stop({ stationId: 'A', plannedDeparture: '2026-08-01T15:00:00.000Z', lat: 50, lon: 20 }),
      stop({ stationId: 'B', plannedArrival: '2026-08-01T16:00:00.000Z', lat: 51, lon: 21 }),
    ]
    const result = resolveInterpolatedPosition(stops, 'S', D('2026-08-01T10:00:00.000Z'))
    expect(result).toBeNull()
  })

  it('skips a cancelled intermediate stop when picking the next stop (mirrors mock train 106)', () => {
    const stops = [
      stop({ stationId: 'A', isConfirmed: true, plannedDeparture: '2026-08-01T10:00:00.000Z', lat: 50, lon: 20 }),
      stop({ stationId: 'B', isCancelled: true, plannedArrival: '2026-08-01T10:30:00.000Z' }),
      stop({ stationId: 'C', plannedArrival: '2026-08-01T11:00:00.000Z', lat: 52, lon: 22 }),
    ]
    const result = resolveInterpolatedPosition(stops, 'P', D('2026-08-01T10:30:00.000Z'))
    expect(result).toEqual({ lat: 51, lon: 21 })
  })

  it('returns null when the anchor or the next stop has no coordinates, instead of guessing', () => {
    const stops = [
      stop({ stationId: 'A', isConfirmed: true, plannedDeparture: '2026-08-01T10:00:00.000Z', lat: null, lon: null }),
      stop({ stationId: 'B', plannedArrival: '2026-08-01T11:00:00.000Z', lat: 51, lon: 21 }),
    ]
    const result = resolveInterpolatedPosition(stops, 'P', D('2026-08-01T10:30:00.000Z'))
    expect(result).toBeNull()
  })

  it('pins the marker at the destination once the train has reached the final confirmed stop', () => {
    const stops = [
      stop({ stationId: 'A', isConfirmed: true, plannedDeparture: '2026-08-01T10:00:00.000Z', lat: 50, lon: 20 }),
      stop({ stationId: 'B', isConfirmed: true, plannedArrival: '2026-08-01T11:00:00.000Z', lat: 51, lon: 21 }),
    ]
    const result = resolveInterpolatedPosition(stops, 'P', D('2026-08-01T12:00:00.000Z'))
    expect(result).toEqual({ lat: 51, lon: 21 })
  })

  it('still returns a position for a stale, dense-line-lagging projection, using the projected anchor', () => {
    const stops = [
      stop({
        stationId: 'A',
        isConfirmed: true,
        plannedDeparture: '2026-08-01T10:00:00.000Z',
        actualDeparture: '2026-08-01T10:10:00.000Z',
        departureDelayMinutes: 10,
        lat: 50,
        lon: 19,
      }),
      stop({ stationId: 'B', plannedArrival: '2026-08-01T11:00:00.000Z', lat: 50.5, lon: 19.5 }),
      stop({ stationId: 'C', plannedArrival: '2026-08-01T12:00:00.000Z', lat: 51, lon: 20 }),
      stop({ stationId: 'D', plannedArrival: '2026-08-01T12:30:00.000Z', lat: 51.5, lon: 20.5 }),
      stop({ stationId: 'E', plannedArrival: '2026-08-01T13:00:00.000Z', lat: 52, lon: 21 }),
    ]
    // offset +10min: D reached at 12:40<=12:50, E at 13:10<=12:50 nie -> projected=D (idx 3, >= anchor(0)+2 -> stale).
    // `now` musi być PRZED planowym przyjazdem ostatniego przystanku (13:00) --
    // `isStalePositionProjection` świadomie zwraca false, gdy `now` już go minęło
    // (podróż uznana za zakończoną), więc 13:05 (po 13:00) unieważniałoby ten test.
    // odcinek D->E: start 12:30+10=12:40, koniec 13:00+10=13:10; 12:50 -> ułamek (10/30)
    const result = resolveInterpolatedPosition(stops, 'S', D('2026-08-01T12:50:00.000Z'))
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(51.667, 2)
    expect(result!.lon).toBeCloseTo(20.667, 2)
  })

  it('uses the actual-vs-planned offset for the stale interpolation window, not the (possibly null) *DelayMinutes fields (AGENTS.md #9 -- one source of offset with resolveProjectedStopIndex)', () => {
    const stops = [
      stop({
        stationId: 'A',
        isConfirmed: true,
        plannedDeparture: '2026-08-01T10:00:00.000Z',
        actualDeparture: '2026-08-01T10:10:00.000Z',
        // PKP dała czas faktyczny, ale nie policzyła jeszcze pola opóźnienia w minutach --
        // dokładnie przypadek z AGENTS.md #2 (isConfirmed jest prawdziwym sygnałem,
        // *DelayMinutes bywa null mimo obecnego actualDeparture).
        departureDelayMinutes: null,
        arrivalDelayMinutes: null,
        lat: 50,
        lon: 19,
      }),
      stop({ stationId: 'B', plannedArrival: '2026-08-01T11:00:00.000Z', lat: 50.5, lon: 19.5 }),
      stop({ stationId: 'C', plannedArrival: '2026-08-01T12:00:00.000Z', lat: 51, lon: 20 }),
      stop({ stationId: 'D', plannedArrival: '2026-08-01T12:30:00.000Z', lat: 51.5, lon: 20.5 }),
      stop({ stationId: 'E', plannedArrival: '2026-08-01T13:00:00.000Z', lat: 52, lon: 21 }),
    ]
    // Ten sam offset (10 min, z actualDeparture - plannedDeparture) i ten sam wynik co
    // test wyżej ("stale, dense-line-lagging") -- jedyna różnica to źródło offsetu.
    // Stary kod (czytający *DelayMinutes wprost) dostałby tu `?? 0` i policzyłby fraction
    // bez przesunięcia (D->E: 12:30-13:00 zamiast 12:40-13:10), inny wynik.
    const result = resolveInterpolatedPosition(stops, 'S', D('2026-08-01T12:50:00.000Z'))
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(51.667, 2)
    expect(result!.lon).toBeCloseTo(20.667, 2)
  })

  it('returns null for an empty stop list', () => {
    expect(resolveInterpolatedPosition([], null, D('2026-08-01T10:00:00.000Z'))).toBeNull()
  })
})
