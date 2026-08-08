import { describe, expect, it } from 'vitest'
import { buildTrainDetailStops } from './trainDetail'
import type { RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'

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
    stations,
  }
}

function operation(stations: RawOperationStation[], operatingDate: string | null = '2026-08-01'): RawTrainOperation {
  return { scheduleId: '2026', orderId: '1', trainOrderId: null, operatingDate, trainStatus: 'P', stations }
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

    expect(stop.platform).toBe('2/2')
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

    it('stays true even once the train stops being confirmed again later (no un-starting)', () => {
      const stops = [
        realizedStop({ stationId: 'A', isConfirmed: true }),
        realizedStop({ stationId: 'B', isConfirmed: false }),
      ]

      const result = buildTrainDetailStops(operation(stops), null, {})

      expect(result[1].hasTrainStarted).toBe(true)
    })
  })
})
