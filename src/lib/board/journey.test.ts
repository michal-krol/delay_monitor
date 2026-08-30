import { describe, expect, it } from 'vitest'
import { stopDelayMinutes, summariseJourney } from './journey'
import type { TrainDetailStop } from './trainDetail'

function stop(overrides: Partial<TrainDetailStop> & { stationId: string; stationName: string }): TrainDetailStop {
  return {
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
    ...overrides,
  }
}

/** Trzy przystanki: A (odjazd, potwierdzony, +0), B (potwierdzony, +4), C (cel, jeszcze nie). */
function sampleStops(): TrainDetailStop[] {
  return [
    stop({
      stationId: 'A',
      stationName: 'Warszawa Centralna',
      plannedDeparture: '2026-08-01T08:32:00+02:00',
      actualDeparture: '2026-08-01T08:32:00+02:00',
      departureDelayMinutes: 0,
      isConfirmed: true,
    }),
    stop({
      stationId: 'B',
      stationName: 'Skierniewice',
      plannedArrival: '2026-08-01T09:23:00+02:00',
      plannedDeparture: '2026-08-01T09:25:00+02:00',
      actualArrival: '2026-08-01T09:27:00+02:00',
      arrivalDelayMinutes: 4,
      departureDelayMinutes: 4,
      isConfirmed: true,
      hasTrainStarted: true,
    }),
    stop({
      stationId: 'C',
      stationName: 'Kraków Główny',
      plannedArrival: '2026-08-01T10:58:00+02:00',
      isConfirmed: false,
      hasTrainStarted: true,
      estimatedDelayMinutes: 4,
    }),
  ]
}

describe('stopDelayMinutes', () => {
  // Odjazdowe pierwsze: to ono decyduje, czy podróż STĄD dalej rusza planowo.
  it('prefers the departure delay over the arrival delay', () => {
    expect(stopDelayMinutes(stop({ stationId: 'A', stationName: 'A', arrivalDelayMinutes: 9, departureDelayMinutes: 2 }))).toBe(2)
  })

  it('falls back to the arrival delay when there is no departure delay', () => {
    expect(stopDelayMinutes(stop({ stationId: 'A', stationName: 'A', arrivalDelayMinutes: 9 }))).toBe(9)
  })
})

describe('summariseJourney', () => {
  it('describes the whole route by default', () => {
    const summary = summariseJourney(sampleStops())
    expect(summary.origin?.stationName).toBe('Warszawa Centralna')
    expect(summary.destination?.stationName).toBe('Kraków Główny')
    expect(summary.stopCount).toBe(3)
    expect(summary.plannedDurationMinutes).toBe(146) // 08:32 -> 10:58
  })

  it('narrows to the requested leg of the route', () => {
    const summary = summariseJourney(sampleStops(), { fromIndex: 1, toIndex: 2 })
    expect(summary.origin?.stationName).toBe('Skierniewice')
    expect(summary.destination?.stationName).toBe('Kraków Główny')
    expect(summary.stopCount).toBe(2)
    expect(summary.plannedDurationMinutes).toBe(93) // 09:25 -> 10:58
  })

  it('clamps an out-of-range leg instead of throwing', () => {
    const summary = summariseJourney(sampleStops(), { fromIndex: -5, toIndex: 99 })
    expect(summary.origin?.stationName).toBe('Warszawa Centralna')
    expect(summary.destination?.stationName).toBe('Kraków Główny')
  })

  it('returns an empty summary for no stops', () => {
    const summary = summariseJourney([])
    expect(summary.origin).toBeNull()
    expect(summary.destination).toBeNull()
    expect(summary.stopCount).toBe(0)
    expect(summary.overallStatus).toBe('unknown')
    expect(summary.delaySeries).toEqual([])
  })

  // Przystanek niepotwierdzony pokazuje PLAN, nigdy surowego `actual`
  // (AGENTS.md #2) -- ta sama zasada, co w przebiegu trasy.
  it('shows the plan for the destination while it is still unconfirmed', () => {
    const summary = summariseJourney(sampleStops())
    expect(summary.destination?.displayAt).toBe('2026-08-01T10:58:00+02:00')
    expect(summary.arrivalDelayMinutes).toBeNull()
    expect(summary.estimatedArrivalDelayMinutes).toBe(4)
    expect(summary.overallStatus).toBe('enRoute')
  })

  it('shows the confirmed actual arrival once the destination is reached', () => {
    const stops = sampleStops()
    stops[2] = stop({
      ...stops[2],
      stationId: 'C',
      stationName: 'Kraków Główny',
      isConfirmed: true,
      actualArrival: '2026-08-01T11:03:00+02:00',
      arrivalDelayMinutes: 5,
      estimatedDelayMinutes: null,
    })
    const summary = summariseJourney(stops)
    expect(summary.destination?.displayAt).toBe('2026-08-01T11:03:00+02:00')
    expect(summary.arrivalDelayMinutes).toBe(5)
    expect(summary.overallStatus).toBe('delayed')
  })

  // Na celu liczy się przyjazd, nie odjazd -- odwrotnie niż w środku trasy.
  it('prefers the arrival delay at the destination', () => {
    const stops = sampleStops()
    stops[2] = stop({
      ...stops[2],
      stationId: 'C',
      stationName: 'Kraków Główny',
      isConfirmed: true,
      arrivalDelayMinutes: 5,
      departureDelayMinutes: 1,
    })
    expect(summariseJourney(stops).arrivalDelayMinutes).toBe(5)
  })

  it('splits the delay series into confirmed facts and projections', () => {
    const summary = summariseJourney(sampleStops())
    expect(summary.delaySeries).toEqual([
      { stationName: 'Warszawa Centralna', delayMinutes: 0, kind: 'fact' },
      { stationName: 'Skierniewice', delayMinutes: 4, kind: 'fact' },
      { stationName: 'Kraków Główny', delayMinutes: 4, kind: 'projection' },
    ])
  })

  it('counts punctuality only from confirmed stops', () => {
    expect(summariseJourney(sampleStops()).punctuality).toEqual({ onTime: 1, total: 2 })
  })

  it('reports no punctuality for a train that has not started', () => {
    const stops = sampleStops().map((s) => stop({ ...s, isConfirmed: false, hasTrainStarted: false }))
    expect(summariseJourney(stops).punctuality).toBeNull()
    expect(summariseJourney(stops).overallStatus).toBe('notStarted')
  })

  it('reports a cancelled destination as cancelled', () => {
    const stops = sampleStops()
    stops[2] = stop({ ...stops[2], stationId: 'C', stationName: 'Kraków Główny', isCancelled: true })
    expect(summariseJourney(stops).overallStatus).toBe('cancelled')
  })

  it('leaves the planned duration null when a planned time is missing', () => {
    const stops = sampleStops()
    stops[0] = stop({ ...stops[0], stationId: 'A', stationName: 'Warszawa Centralna', plannedDeparture: null })
    expect(summariseJourney(stops).plannedDurationMinutes).toBeNull()
  })
})

describe('summariseJourney — zamrożony feed PKP', () => {
  // Ta sama reguła co w wierszu przystanku (`STALE_UNCONFIRMED_MS`): plan
  // dawno minął, potwierdzenia wciąż nie ma -> „brak danych", nie pewne siebie
  // „jeszcze nie wyjechał". Bez `now` nagłówek twierdziłby co innego niż
  // wiersz tego samego przystanku niżej.
  it('reports unknown, not notStarted, for a destination whose plan is long past', () => {
    const stops = sampleStops().map((s) => stop({ ...s, isConfirmed: false, hasTrainStarted: false, departureDelayMinutes: null }))
    const summary = summariseJourney(stops, { now: new Date('2026-08-01T14:00:00+02:00') })
    expect(summary.overallStatus).toBe('unknown')
  })

  it('still reports notStarted before the planned time', () => {
    const stops = sampleStops().map((s) => stop({ ...s, isConfirmed: false, hasTrainStarted: false, departureDelayMinutes: null }))
    const summary = summariseJourney(stops, { now: new Date('2026-08-01T08:00:00+02:00') })
    expect(summary.overallStatus).toBe('notStarted')
  })
})
