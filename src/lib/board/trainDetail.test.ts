import { describe, expect, it } from 'vitest'
import {
  buildTrainDetailStops,
  isScheduleProjection,
  isStalePositionProjection,
  resolveCurrentStopIndex,
  resolveProjectedStopIndex,
  resolveScheduledStopIndex,
  type TrainDetailStop,
} from './trainDetail'
import type { RawDisruption, RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'

/** Realizacja bez planu/opóźnienia — dokładnie taki kształt, jaki naprawdę zwraca `/operations/train/{scheduleId}/{orderId}/{operatingDate}` na żywo (stwierdzone bezpośrednio na API, nie w dokumentacji). */
function realizedStop(overrides: Partial<RawOperationStation> & { stationId: string }): RawOperationStation {
  return {
    plannedArrival: null,
    plannedDeparture: null,
    actualArrival: null,
    actualDeparture: null,
    arrivalDelayMinutes: null,
    departureDelayMinutes: null,
    isCancelled: false,
    isConfirmed: true,
    ...overrides,
  }
}

function routeStop(overrides: Partial<RawRouteStop> & { stationId: string }): RawRouteStop {
  return {
    arrivalPlatform: null,
    arrivalTrack: null,
    departurePlatform: null,
    departureTrack: null,
    arrivalTime: null,
    departureTime: null,
    arrivalDay: null,
    departureDay: null,
    stopTypeName: null,
    ...overrides,
  }
}

function route(stations: RawRouteStop[]): RawRoute {
  return {
    scheduleId: '2026',
    orderId: '1',
    trainOrderId: null,
    carrierCode: 'IC',
    commercialCategorySymbol: 'EIC',
    name: 'Test',
    nationalNumber: null,
    operatingDates: [],
    stations,
  }
}

function operation(
  stations: RawOperationStation[],
  operatingDate: string | null = '2026-08-01',
  trainStatus: string | null = null
): RawTrainOperation {
  return { scheduleId: '2026', orderId: '1', trainOrderId: null, operatingDate, trainStatus, stations }
}

describe('buildTrainDetailStops', () => {
  it('computes a growing delay only from the stop where it actually starts, not for the on-time stops before it', () => {
    // Dokładnie scenariusz z pytania: pociąg punktualny do 4. stacji, dopiero
    // potem zaczyna tracić czas. Każdy przystanek musi dostać własne,
    // niezależnie policzone opóźnienie -- nie średnią ani opóźnienie całego
    // pociągu rozlane na wszystkie przystanki.
    const stops: RawOperationStation[] = [
      realizedStop({ stationId: 'A', actualDeparture: '2026-08-01T10:00:00+02:00' }), // plan 10:00, punktualnie
      realizedStop({ stationId: 'B', actualArrival: '2026-08-01T10:20:00+02:00', actualDeparture: '2026-08-01T10:22:00+02:00' }), // plan 10:20/10:22, punktualnie
      realizedStop({ stationId: 'C', actualArrival: '2026-08-01T10:40:00+02:00', actualDeparture: '2026-08-01T10:42:00+02:00' }), // plan 10:40/10:42, punktualnie
      realizedStop({ stationId: 'D', actualArrival: '2026-08-01T11:03:00+02:00', actualDeparture: '2026-08-01T11:08:00+02:00' }), // plan 11:00/11:02 -- tu zaczyna się opóźnienie
      realizedStop({ stationId: 'E', actualArrival: '2026-08-01T11:35:00+02:00' }), // plan 11:20 -- opóźnienie narosło
    ]
    const routeStops: RawRouteStop[] = [
      routeStop({ stationId: 'A', departureTime: '10:00:00' }),
      routeStop({ stationId: 'B', arrivalTime: '10:20:00', departureTime: '10:22:00' }),
      routeStop({ stationId: 'C', arrivalTime: '10:40:00', departureTime: '10:42:00' }),
      routeStop({ stationId: 'D', arrivalTime: '11:00:00', departureTime: '11:02:00' }),
      routeStop({ stationId: 'E', arrivalTime: '11:20:00' }),
    ]

    const result = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(result.map((s) => [s.stationId, s.arrivalDelayMinutes, s.departureDelayMinutes])).toEqual([
      ['A', null, 0],
      ['B', 0, 0],
      ['C', 0, 0],
      ['D', 3, 6],
      ['E', 15, null],
    ])
  })

  it('estimates the delay of an en-route stop from the nearest earlier confirmed stop, matching what the board shows for the same stop', () => {
    const stops: RawOperationStation[] = [
      realizedStop({ stationId: 'A', actualDeparture: '2026-08-01T10:06:00+02:00' }), // plan 10:00 -> +6 min, potwierdzony
      realizedStop({ stationId: 'B', isConfirmed: false }), // jeszcze w trasie, plan dopiero
    ]
    const routeStops: RawRouteStop[] = [
      routeStop({ stationId: 'A', departureTime: '10:00:00' }),
      routeStop({ stationId: 'B', arrivalTime: '10:20:00' }),
    ]

    const result = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(result[0].estimatedDelayMinutes).toBeNull() // potwierdzony przystanek ma fakt (departureDelayMinutes), nie szacunek
    expect(result[1].estimatedDelayMinutes).toBe(6)
  })

  it("never uses a cancelled stop's delay as the estimate source for a later en-route stop", () => {
    const stops: RawOperationStation[] = [
      realizedStop({ stationId: 'A', isCancelled: true, isConfirmed: true, departureDelayMinutes: 20 }),
      realizedStop({ stationId: 'B', isConfirmed: false }),
    ]

    const result = buildTrainDetailStops(operation(stops), null, {})

    expect(result[1].estimatedDelayMinutes).toBeNull()
  })

  it('never estimates a delay before the train has started at all', () => {
    const result = buildTrainDetailStops(operation([realizedStop({ stationId: 'A', isConfirmed: false })]), null, {})
    expect(result[0].estimatedDelayMinutes).toBeNull()
  })

  it('resolves planned times from the route (operatingDate + arrivalTime/departureTime), not just actuals', () => {
    const stops = [realizedStop({ stationId: 'A', actualDeparture: '2026-08-01T10:07:00+02:00' })]
    const routeStops = [routeStop({ stationId: 'A', departureTime: '10:00:00' })]

    const [stop] = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(stop.plannedDeparture).toBe('2026-08-01T08:00:00.000Z')
    expect(stop.departureDelayMinutes).toBe(7)
  })

  it('shifts the planned date forward when the route stop is reached after midnight (dayOffset)', () => {
    const stops = [realizedStop({ stationId: 'A', actualArrival: '2026-08-02T00:40:00+02:00' })]
    const routeStops = [routeStop({ stationId: 'A', arrivalTime: '00:33:00', arrivalDay: 1 })]

    const [stop] = buildTrainDetailStops(operation(stops), route(routeStops), {})

    // Bez dayOffset plan wypadłby 01.08 00:33, czyli "przed" faktycznym 02.08
    // -- ale o prawie dobę, nie 7 minut. Z przesunięciem dnia wychodzi poprawnie.
    expect(stop.plannedArrival).toBe('2026-08-01T22:33:00.000Z')
    expect(stop.arrivalDelayMinutes).toBe(7)
  })

  it('still returns realized times (actual, isCancelled, isConfirmed) when there is no matching route at all', () => {
    // Mniejszość pociągów bez dopasowanej trasy (patrz README) -- realizacja
    // musi się pokazać, plan/opóźnienie/peron zostają puste, nie cała lista.
    const stops = [
      realizedStop({ stationId: 'A', actualDeparture: '2026-08-01T10:07:00+02:00', isConfirmed: true }),
      realizedStop({ stationId: 'B', isCancelled: true, isConfirmed: false }),
    ]

    const result = buildTrainDetailStops(operation(stops), null, {})

    expect(result[0]).toMatchObject({
      stationId: 'A',
      actualDeparture: '2026-08-01T10:07:00+02:00',
      plannedDeparture: null,
      departureDelayMinutes: null,
      platform: null,
      isConfirmed: true,
    })
    expect(result[1]).toMatchObject({ stationId: 'B', isCancelled: true, isConfirmed: false })
  })

  it('prefers a planned time/delay already present on the operation itself over computing one from the route', () => {
    // Fixture'y mocka (i teoretycznie inne warianty API) mogą podać plan wprost
    // na obiekcie realizacji -- to ma pierwszeństwo nad liczeniem z trasy.
    const stops = [
      realizedStop({
        stationId: 'A',
        plannedDeparture: '2026-08-01T10:00:00+02:00',
        actualDeparture: '2026-08-01T10:05:00+02:00',
        departureDelayMinutes: 5,
      }),
    ]
    const routeStops = [routeStop({ stationId: 'A', departureTime: '10:30:00' })] // celowo inny czas -- nie powinien zostać użyty

    const [stop] = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(stop.plannedDeparture).toBe('2026-08-01T10:00:00+02:00')
    expect(stop.departureDelayMinutes).toBe(5)
  })

  it('resolves station names from the provided dictionary, falling back to the raw id', () => {
    const stops = [realizedStop({ stationId: 'A' }), realizedStop({ stationId: 'B' })]

    const result = buildTrainDetailStops(operation(stops), null, { A: 'Warszawa Centralna' })

    expect(result[0].stationName).toBe('Warszawa Centralna')
    expect(result[1].stationName).toBe('B')
  })

  it('picks the departure platform/track over the arrival side when a stop has both', () => {
    const stops = [realizedStop({ stationId: 'A' })]
    const routeStops = [
      routeStop({ stationId: 'A', arrivalPlatform: '1', arrivalTrack: '1', departurePlatform: '2', departureTrack: '2' }),
    ]

    const [stop] = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(stop.platform).toBe('2')
    expect(stop.track).toBe('2')
  })

  it('never computes a delay for an unconfirmed stop, even when actual genuinely differs from planned', () => {
    // isConfirmed jest teraz sprawdzane przed jakimkolwiek liczeniem --
    // wcześniej ta funkcja liczyła opóźnienie niezależnie od isConfirmed
    // i tylko UI (ConnectionDetails) je ukrywał. Ta luka jest teraz zamknięta
    // na tym samym poziomie, co board/transform.ts.
    const stops = [
      realizedStop({
        stationId: 'A',
        actualDeparture: '2026-08-01T10:20:00+02:00',
        isConfirmed: false,
      }),
    ]
    const routeStops = [routeStop({ stationId: 'A', departureTime: '10:00:00' })]

    const [stop] = buildTrainDetailStops(operation(stops), route(routeStops), {})

    expect(stop.plannedDeparture).toBe('2026-08-01T08:00:00.000Z')
    expect(stop.actualDeparture).toBe('2026-08-01T10:20:00+02:00')
    expect(stop.departureDelayMinutes).toBeNull()
  })

  describe('predictedArrival/predictedDeparture', () => {
    // Zaobserwowane na żywym API (audyt, 4 stacje, ~7300 pociągów): PKP czasem
    // wpisuje w `actualArrival`/`actualDeparture` niepotwierdzonego przystanku
    // realną, samodzielnie przeliczoną projekcję (dokładny przykład produkcyjny
    // niżej: pociąg 2026/583770053, stacja Gdańsk Główny 7500), a czasem wartość
    // przesuniętą o dokładną wielokrotność doby -- artefakt, nie przewidywanie.
    it('treats actual as a genuine predicted time when it differs from plan by a plausible, sub-day amount', () => {
      const stops = [
        realizedStop({ stationId: '7500', isConfirmed: false, actualArrival: '2026-08-26T00:01:30+02:00', actualDeparture: '2026-08-26T00:03:30+02:00' }),
      ]
      const routeStops = [routeStop({ stationId: '7500', arrivalTime: '23:29:30', departureTime: '23:32:30' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-25'), route(routeStops), {})

      expect(stop.predictedArrival).toBe('2026-08-26T00:01:30+02:00')
      expect(stop.predictedDeparture).toBe('2026-08-26T00:03:30+02:00')
    })

    it('treats a diff of exactly one minute as a genuine (if small) predicted delay, not the day-multiple artifact', () => {
      // Zweryfikowane na żywym API (produkcja, pociąg SŁOWACKI 2026/134648284,
      // stacja Żyrardów 34207, 2026-08-27): plan 17:22:30, actual 17:23:30 --
      // dokładnie 60s różnicy, realne (malejące, poprzedni przystanek miał
      // +2 min) opóźnienie, nie artefakt kopii planu. Poprzedni próg tolerancji
      // (60s, `<=`) błędnie łapał ten przypadek i chował realny predicted czas.
      const stops = [realizedStop({ stationId: 'A', isConfirmed: false, actualArrival: '2026-08-27T17:23:30+02:00' })]
      const routeStops = [routeStop({ stationId: 'A', arrivalTime: '17:22:30' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-27'), route(routeStops), {})

      expect(stop.predictedArrival).toBe('2026-08-27T17:23:30+02:00')
    })

    it('ignores actual when it differs from plan by an exact day multiple -- the known PKP artifact, not a real prediction', () => {
      const stops = [realizedStop({ stationId: 'A', isConfirmed: false, actualArrival: '2026-08-27T05:55:00+02:00' })]
      const routeStops = [routeStop({ stationId: 'A', arrivalTime: '05:55:00' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-25'), route(routeStops), {})

      expect(stop.predictedArrival).toBeNull()
    })

    it('ignores actual when it exactly equals plan -- no prediction to show, same guard as the day-multiple case', () => {
      const stops = [realizedStop({ stationId: 'A', isConfirmed: false, actualArrival: '2026-08-25T05:55:00+02:00' })]
      const routeStops = [routeStop({ stationId: 'A', arrivalTime: '05:55:00' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-25'), route(routeStops), {})

      expect(stop.predictedArrival).toBeNull()
    })

    it('is always null once the stop is confirmed -- a fact never needs a prediction alongside it', () => {
      const stops = [realizedStop({ stationId: 'A', isConfirmed: true, actualArrival: '2026-08-26T05:55:00+02:00' })]
      const routeStops = [routeStop({ stationId: 'A', arrivalTime: '05:55:00' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-25'), route(routeStops), {})

      expect(stop.predictedArrival).toBeNull()
    })

    it('is null when there is no planned time to compare against (no route match)', () => {
      const stops = [realizedStop({ stationId: 'A', isConfirmed: false, actualArrival: '2026-08-26T05:55:00+02:00' })]

      const [stop] = buildTrainDetailStops(operation(stops, '2026-08-25'), null, {})

      expect(stop.predictedArrival).toBeNull()
    })
  })

  describe('hasTrainStarted', () => {
    it('is false for every stop when the train has not left any stop yet', () => {
      const stops = [
        realizedStop({ stationId: 'A', isConfirmed: false }),
        realizedStop({ stationId: 'B', isConfirmed: false }),
        realizedStop({ stationId: 'C', isConfirmed: false }),
      ]

      const result = buildTrainDetailStops(operation(stops), null, {})

      expect(result.map((s) => s.hasTrainStarted)).toEqual([false, false, false])
    })

    it('is true only for stops after the first confirmed one, not for the confirmed stop itself', () => {
      const stops = [
        realizedStop({ stationId: 'A', isConfirmed: true }),
        realizedStop({ stationId: 'B', isConfirmed: true }),
        realizedStop({ stationId: 'C', isConfirmed: false }),
        realizedStop({ stationId: 'D', isConfirmed: false }),
      ]

      const result = buildTrainDetailStops(operation(stops), null, {})

      expect(result.map((s) => [s.stationId, s.hasTrainStarted])).toEqual([
        ['A', false],
        ['B', true],
        ['C', true],
        ['D', true],
      ])
    })

    it('is true for every stop when trainStatus is P/C, even before any stop is confirmed (AGENTS.md #2 escape hatch, same as the board)', () => {
      const stops = [
        realizedStop({ stationId: 'A', isConfirmed: false }),
        realizedStop({ stationId: 'B', isConfirmed: false }),
      ]

      const result = buildTrainDetailStops(operation(stops, '2026-08-01', 'P'), null, {})

      expect(result.map((s) => s.hasTrainStarted)).toEqual([true, true])
    })

    it('stays true even once the train stops being confirmed again later (no un-starting)', () => {
      const stops = [
        realizedStop({ stationId: 'A', isConfirmed: true }),
        realizedStop({ stationId: 'B', isConfirmed: false }),
      ]

      const result = buildTrainDetailStops(operation(stops), null, {})

      expect(result[1].hasTrainStarted).toBe(true)
    })
  })

  describe('disruptionMessages', () => {
    function affectedRoute(stationId: string) {
      return { scheduleId: '2026', orderId: '1', operatingDate: '2026-08-01', stationId }
    }

    it('carries the decoded message on the exact matching stop only', () => {
      const stops = [realizedStop({ stationId: 'A' }), realizedStop({ stationId: 'B' })]
      const disruptions: RawDisruption[] = [{ disruptionId: 1, message: 'utr_40', affectedRoutes: [affectedRoute('A')] }]
      const disruptionTypes = { utr_40: 'Awaria sieci trakcyjnej' }

      const result = buildTrainDetailStops(operation(stops), null, {}, disruptions, disruptionTypes)

      expect(result[0].disruptionMessages).toEqual(['Awaria sieci trakcyjnej'])
      expect(result[1].disruptionMessages).toEqual([])
    })

    it('defaults to an empty array when disruptions/disruptionTypes are omitted', () => {
      const stops = [realizedStop({ stationId: 'A' })]
      const result = buildTrainDetailStops(operation(stops), null, {})
      expect(result[0].disruptionMessages).toEqual([])
    })

    it('is empty when operatingDate is null (nothing to match affectedRoutes against)', () => {
      const stops = [realizedStop({ stationId: 'A' })]
      const disruptions: RawDisruption[] = [{ disruptionId: 1, message: 'utr_40', affectedRoutes: [affectedRoute('A')] }]
      const result = buildTrainDetailStops(operation(stops, null), null, {}, disruptions, { utr_40: 'Awaria sieci trakcyjnej' })
      expect(result[0].disruptionMessages).toEqual([])
    })
  })
})

describe('buildTrainDetailStops — postój i typ postoju', () => {
  it('computes the planned dwell time in whole minutes', () => {
    const stops = buildTrainDetailStops(
      operation([realizedStop({ stationId: 'A' })]),
      route([routeStop({ stationId: 'A', arrivalTime: '10:00:00', departureTime: '10:13:00' })]),
      {}
    )
    expect(stops[0].stopMinutes).toBe(13)
  })

  // Na żywym API 1650 z 7173 postojów trwa krócej niż minutę. Gołe dzielenie
  // przez 60000 dałoby `0`, czyli „brak postoju" -- zaokrąglamy w górę do 1,
  // bo postój ISTNIEJE, tylko jest krótki.
  it('rounds a sub-minute dwell up to 1 instead of collapsing it to 0', () => {
    const stops = buildTrainDetailStops(
      operation([realizedStop({ stationId: 'A' })]),
      route([routeStop({ stationId: 'A', arrivalTime: '10:00:00', departureTime: '10:00:30' })]),
      {}
    )
    expect(stops[0].stopMinutes).toBe(1)
  })

  it('reports no dwell for a terminus (only one of arrival/departure is planned)', () => {
    const stops = buildTrainDetailStops(
      operation([realizedStop({ stationId: 'A' }), realizedStop({ stationId: 'B' })]),
      route([
        routeStop({ stationId: 'A', departureTime: '10:00:00' }),
        routeStop({ stationId: 'B', arrivalTime: '11:00:00' }),
      ]),
      {}
    )
    expect(stops[0].stopMinutes).toBeNull()
    expect(stops[1].stopMinutes).toBeNull()
  })

  it('passes stopTypeName through from the route stop', () => {
    const stops = buildTrainDetailStops(
      operation([realizedStop({ stationId: 'A' })]),
      route([routeStop({ stationId: 'A', stopTypeName: 'tylko dla wysiadających' })]),
      {}
    )
    expect(stops[0].stopTypeName).toBe('tylko dla wysiadających')
  })

  it('leaves dwell and stop type null for a train with no matched route', () => {
    const stops = buildTrainDetailStops(operation([realizedStop({ stationId: 'A' })]), null, {})
    expect(stops[0].stopMinutes).toBeNull()
    expect(stops[0].stopTypeName).toBeNull()
  })
})

/** Minimalny `TrainDetailStop` — tylko pola, których dotyka tryb rozkładowy. */
function detailStop(overrides: Partial<TrainDetailStop> & { stationId: string }): TrainDetailStop {
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
    ...overrides,
  }
}

// Prosta trasa: A odjazd 10:00, B przyjazd 11:00 / odjazd 11:02, C przyjazd 12:00.
const projectionRoute: TrainDetailStop[] = [
  detailStop({ stationId: 'A', plannedDeparture: '2026-08-01T10:00:00.000Z' }),
  detailStop({ stationId: 'B', plannedArrival: '2026-08-01T11:00:00.000Z', plannedDeparture: '2026-08-01T11:02:00.000Z' }),
  detailStop({ stationId: 'C', plannedArrival: '2026-08-01T12:00:00.000Z' }),
]

describe('isScheduleProjection', () => {
  it('is true for a train with zero realization that the schedule places mid-route', () => {
    expect(isScheduleProjection(projectionRoute, 'S', new Date('2026-08-01T11:30:00.000Z'))).toBe(true)
  })

  it('is false before the scheduled departure and at/after the scheduled arrival', () => {
    expect(isScheduleProjection(projectionRoute, 'S', new Date('2026-08-01T09:59:00.000Z'))).toBe(false)
    expect(isScheduleProjection(projectionRoute, 'S', new Date('2026-08-01T12:00:00.000Z'))).toBe(false)
    expect(isScheduleProjection(projectionRoute, 'S', new Date('2026-08-01T13:00:00.000Z'))).toBe(false)
  })

  it('is false once any stop is confirmed — real data wins', () => {
    const stops = projectionRoute.map((s, i) => (i === 0 ? { ...s, isConfirmed: true } : s))
    expect(isScheduleProjection(stops, 'S', new Date('2026-08-01T11:30:00.000Z'))).toBe(false)
  })

  it('is false for a cancelled stop or trainStatus X, true for partial-cancel Q', () => {
    const cancelledStop = projectionRoute.map((s, i) => (i === 1 ? { ...s, isCancelled: true } : s))
    expect(isScheduleProjection(cancelledStop, 'S', new Date('2026-08-01T11:30:00.000Z'))).toBe(false)
    expect(isScheduleProjection(projectionRoute, 'X', new Date('2026-08-01T11:30:00.000Z'))).toBe(false)
    expect(isScheduleProjection(projectionRoute, 'Q', new Date('2026-08-01T11:30:00.000Z'))).toBe(true)
  })

  it('is false when the route is not matched (no planned times on the endpoints)', () => {
    const noRoute = [detailStop({ stationId: 'A' }), detailStop({ stationId: 'B' })]
    expect(isScheduleProjection(noRoute, 'S', new Date('2026-08-01T11:30:00.000Z'))).toBe(false)
  })

  it('is false for an empty stop list', () => {
    expect(isScheduleProjection([], 'S', new Date('2026-08-01T11:30:00.000Z'))).toBe(false)
  })

  it('handles an after-midnight route whose ISO times are already composed', () => {
    const nightRoute = [
      detailStop({ stationId: 'A', plannedDeparture: '2026-08-01T22:30:00.000Z' }),
      detailStop({ stationId: 'B', plannedArrival: '2026-08-02T00:40:00.000Z' }),
    ]
    expect(isScheduleProjection(nightRoute, 'S', new Date('2026-08-01T23:50:00.000Z'))).toBe(true)
    expect(isScheduleProjection(nightRoute, 'S', new Date('2026-08-02T01:00:00.000Z'))).toBe(false)
  })
})

describe('resolveScheduledStopIndex', () => {
  it('points at the last stop whose scheduled time is already past', () => {
    expect(resolveScheduledStopIndex(projectionRoute, new Date('2026-08-01T10:30:00.000Z'))).toBe(0)
    expect(resolveScheduledStopIndex(projectionRoute, new Date('2026-08-01T11:30:00.000Z'))).toBe(1)
  })

  it('counts a stop as reached exactly at its scheduled time, not a second before', () => {
    expect(resolveScheduledStopIndex(projectionRoute, new Date('2026-08-01T11:00:00.000Z'))).toBe(1)
    expect(resolveScheduledStopIndex(projectionRoute, new Date('2026-08-01T10:59:59.000Z'))).toBe(0)
  })

  it('returns -1 when no stop has a past scheduled time', () => {
    expect(resolveScheduledStopIndex(projectionRoute, new Date('2026-08-01T09:00:00.000Z'))).toBe(-1)
  })

  it('skips stops with no planned time instead of stopping at them', () => {
    const withGap = [
      detailStop({ stationId: 'A', plannedDeparture: '2026-08-01T10:00:00.000Z' }),
      detailStop({ stationId: 'B' }),
      detailStop({ stationId: 'C', plannedArrival: '2026-08-01T12:00:00.000Z' }),
    ]
    expect(resolveScheduledStopIndex(withGap, new Date('2026-08-01T11:00:00.000Z'))).toBe(0)
  })
})

// Gęsta linia: A odjazd 10:00 (potwierdzony), potem B..E co ~30 min.
const D = (hhmm: string) => `2026-08-01T${hhmm}:00.000Z`
const staleRoute: TrainDetailStop[] = [
  detailStop({ stationId: 'A', plannedDeparture: D('10:00'), actualDeparture: D('10:00'), isConfirmed: true }),
  detailStop({ stationId: 'B', plannedArrival: D('11:00'), plannedDeparture: D('11:02') }),
  detailStop({ stationId: 'C', plannedArrival: D('12:00'), plannedDeparture: D('12:02') }),
  detailStop({ stationId: 'D', plannedArrival: D('12:30'), plannedDeparture: D('12:32') }),
  detailStop({ stationId: 'E', plannedArrival: D('13:00') }),
]

describe('resolveProjectedStopIndex', () => {
  it('projects forward from the last confirmed stop at schedule pace', () => {
    // Kotwica A o 10:00 bez opóźnienia; o 12:05 minęły plany B (11:00) i C (12:00), nie D (12:30).
    expect(resolveProjectedStopIndex(staleRoute, new Date(D('12:05')))).toBe(2)
  })

  it('shifts the projection by the delay measured at the anchor', () => {
    // Kotwica A wyjechała 10:10 (+10 min) -> plany przesunięte: o 12:05 minął tylko B (proj 11:10), nie C (proj 12:10).
    const late = staleRoute.map((s, i) => (i === 0 ? { ...s, actualDeparture: D('10:10') } : s))
    expect(resolveProjectedStopIndex(late, new Date(D('12:05')))).toBe(1)
  })

  it('returns the anchor itself when now has not passed the next stop', () => {
    expect(resolveProjectedStopIndex(staleRoute, new Date(D('10:30')))).toBe(0)
  })

  it('returns -1 when the anchor has no usable actual/planned time', () => {
    const noActual = staleRoute.map((s, i) => (i === 0 ? { ...s, actualDeparture: null } : s))
    expect(resolveProjectedStopIndex(noActual, new Date(D('12:05')))).toBe(-1)
  })

  it('returns -1 when no stop is confirmed', () => {
    expect(resolveProjectedStopIndex(projectionRoute, new Date(D('11:30')))).toBe(-1)
  })
})

describe('isStalePositionProjection', () => {
  it('is true when the schedule places the train >=2 stops past the last confirmed one', () => {
    expect(isStalePositionProjection(staleRoute, 'S', new Date(D('12:05')))).toBe(true)
  })

  it('is false while confirmations keep up (schedule is only one stop ahead)', () => {
    expect(isStalePositionProjection(staleRoute, 'S', new Date(D('11:05')))).toBe(false)
  })

  it('is false when the last confirmed stop is the destination', () => {
    const allConfirmed = staleRoute.map((s) => ({ ...s, isConfirmed: true, actualArrival: s.plannedArrival, actualDeparture: s.plannedDeparture }))
    expect(isStalePositionProjection(allConfirmed, 'S', new Date(D('12:05')))).toBe(false)
  })

  it('is false once the scheduled arrival at the destination has passed', () => {
    expect(isStalePositionProjection(staleRoute, 'S', new Date(D('13:30')))).toBe(false)
  })

  it('is false when any stop is cancelled or the whole train is cancelled (trainStatus X)', () => {
    const withCancel = staleRoute.map((s, i) => (i === 2 ? { ...s, isCancelled: true } : s))
    expect(isStalePositionProjection(withCancel, 'S', new Date(D('12:05')))).toBe(false)
    expect(isStalePositionProjection(staleRoute, 'X', new Date(D('12:05')))).toBe(false)
  })

  it('is false with zero confirmations — that is isScheduleProjection territory', () => {
    expect(isStalePositionProjection(projectionRoute, 'S', new Date(D('11:30')))).toBe(false)
  })
})

describe('resolveCurrentStopIndex', () => {
  it('points at the last confirmed stop -- that is where the train actually is', () => {
    const stops = buildTrainDetailStops(
      operation([
        realizedStop({ stationId: 'A', isConfirmed: true }),
        realizedStop({ stationId: 'B', isConfirmed: true }),
        realizedStop({ stationId: 'C', isConfirmed: false }),
      ]),
      null,
      {}
    )
    expect(resolveCurrentStopIndex(stops)).toBe(1)
  })

  // `actualDeparture` bez `isConfirmed` nie dowodzi realizacji (AGENTS.md #2) --
  // ta sama zasada musi obowiązywać dla pytania „gdzie jest pociąg".
  it('ignores an unconfirmed stop that already carries an actual time', () => {
    const stops = buildTrainDetailStops(
      operation([
        realizedStop({ stationId: 'A', isConfirmed: true }),
        realizedStop({ stationId: 'B', isConfirmed: false, actualDeparture: '2026-08-01T10:20:00+02:00' }),
      ]),
      null,
      {}
    )
    expect(resolveCurrentStopIndex(stops)).toBe(0)
  })

  it('returns -1 for a train that has not started anywhere yet', () => {
    const stops = buildTrainDetailStops(
      operation([realizedStop({ stationId: 'A', isConfirmed: false }), realizedStop({ stationId: 'B', isConfirmed: false })]),
      null,
      {}
    )
    expect(resolveCurrentStopIndex(stops)).toBe(-1)
  })

  it('returns -1 for an empty stop list', () => {
    expect(resolveCurrentStopIndex([])).toBe(-1)
  })
})
