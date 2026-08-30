import { describe, expect, it } from 'vitest'
import { computeStationRealization, computeStationSchedule, computeStationStats } from './stationStats'
import type { RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'

const TODAY = '2026-08-01'
const TOMORROW = '2026-08-02'

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

function route(overrides: Partial<RawRoute> & { scheduleId: string }): RawRoute {
  return {
    orderId: '1',
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    operatingDates: [TODAY],
    stations: [],
    ...overrides,
  }
}

/**
 * Statystyki dostają **surową listę** tras, nie indeks po kluczu przejazdu --
 * indeks zwija warianty tego samego przejazdu z różnych dni i zaniżałby
 * liczniki (patrz `computeStationSchedule`).
 */
function routeList(routes: RawRoute[]): RawRoute[] {
  return routes
}

function stop(overrides: Partial<RawOperationStation> & { stationId: string }): RawOperationStation {
  return {
    plannedArrival: null,
    actualArrival: null,
    plannedDeparture: null,
    actualDeparture: null,
    arrivalDelayMinutes: null,
    departureDelayMinutes: null,
    isCancelled: false,
    isConfirmed: false,
    ...overrides,
  }
}

function train(scheduleId: string, stations: RawOperationStation[]): RawTrainOperation {
  return { scheduleId, orderId: '1', trainOrderId: null, operatingDate: TODAY, trainStatus: null, stations }
}

const NAMES = { '5100': 'Warszawa Zachodnia', '5136': 'Kraków Główny', '4900': 'Wrocław Główny' }

describe('computeStationSchedule', () => {
  it('counts today\'s departures and arrivals at the station separately', () => {
    const routes = routeList([
      route({
        scheduleId: 'a',
        stations: [routeStop({ stationId: '5100', departureTime: '08:00:00' }), routeStop({ stationId: '5136', arrivalTime: '11:00:00' })],
      }),
      route({
        scheduleId: 'b',
        stations: [routeStop({ stationId: '4900', departureTime: '07:00:00' }), routeStop({ stationId: '5100', arrivalTime: '09:30:00' })],
      }),
      // Przelotowy: liczy się i jako przyjazd, i jako odjazd.
      route({
        scheduleId: 'c',
        stations: [
          routeStop({ stationId: '4900', departureTime: '06:00:00' }),
          routeStop({ stationId: '5100', arrivalTime: '08:10:00', departureTime: '08:12:00' }),
          routeStop({ stationId: '5136', arrivalTime: '12:00:00' }),
        ],
      }),
    ])

    const result = computeStationSchedule('5100', routes, NAMES, TODAY)

    expect(result.departuresToday).toBe(2)
    expect(result.arrivalsToday).toBe(2)
  })

  it('ignores routes that only run tomorrow -- the schedules window covers today+tomorrow', () => {
    const routes = routeList([
      route({
        scheduleId: 'a',
        operatingDates: [TOMORROW],
        stations: [routeStop({ stationId: '5100', departureTime: '08:00:00' }), routeStop({ stationId: '5136' })],
      }),
    ])

    expect(computeStationSchedule('5100', routes, NAMES, TODAY).departuresToday).toBe(0)
    expect(computeStationSchedule('5100', routes, NAMES, TOMORROW).departuresToday).toBe(1)
  })

  it('reports null -- not zero -- when the schedule is unavailable', () => {
    // Pobranie rozkładu padło (patrz `fetchRoutesByTrainId` w poller.ts).
    // „Nie udało się sprawdzić" i „brak pociągów" to dwa różne komunikaty
    // (AGENTS.md #7) i muszą być odróżnialne po stronie UI.
    for (const empty of [null, routeList([])]) {
      const result = computeStationSchedule('5100', empty, NAMES, TODAY)
      expect(result.departuresToday).toBeNull()
      expect(result.arrivalsToday).toBeNull()
      expect(result.insights.hourlyTraffic).toBeNull()
    }
  })

  it('ranks destinations by today\'s departure count, resolving names from the dictionary', () => {
    const toKrakow = (id: string) =>
      route({
        scheduleId: id,
        stations: [routeStop({ stationId: '5100', departureTime: '08:00:00' }), routeStop({ stationId: '5136' })],
      })
    const toWroclaw = (id: string) =>
      route({
        scheduleId: id,
        stations: [routeStop({ stationId: '5100', departureTime: '09:00:00' }), routeStop({ stationId: '4900' })],
      })

    const result = computeStationSchedule('5100', routeList([toKrakow('a'), toKrakow('b'), toWroclaw('c')]), NAMES, TODAY)

    expect(result.insights.topDestinations).toEqual([
      { stationId: '5136', name: 'Kraków Główny', count: 2 },
      { stationId: '4900', name: 'Wrocław Główny', count: 1 },
    ])
  })

  it('does not count a train terminating here as a connection "to" anywhere', () => {
    const routes = routeList([
      route({
        scheduleId: 'a',
        // 5100 jest ostatnim przystankiem -- ma przyjazd, nie ma odjazdu.
        stations: [routeStop({ stationId: '4900', departureTime: '06:00:00' }), routeStop({ stationId: '5100', arrivalTime: '08:00:00' })],
      }),
    ])

    const result = computeStationSchedule('5100', routes, NAMES, TODAY)

    expect(result.arrivalsToday).toBe(1)
    expect(result.departuresToday).toBe(0)
    expect(result.insights.topDestinations).toEqual([])
  })

  it('buckets departures by Warsaw wall-clock hour straight from the schedule string', () => {
    const routes = routeList([
      route({ scheduleId: 'a', stations: [routeStop({ stationId: '5100', departureTime: '08:15:00' }), routeStop({ stationId: '5136' })] }),
      route({ scheduleId: 'b', stations: [routeStop({ stationId: '5100', departureTime: '08:55:00' }), routeStop({ stationId: '5136' })] }),
      route({ scheduleId: 'c', stations: [routeStop({ stationId: '5100', departureTime: '23:05:00' }), routeStop({ stationId: '5136' })] }),
    ])

    const hourly = computeStationSchedule('5100', routes, NAMES, TODAY).insights.hourlyTraffic

    expect(hourly).toHaveLength(24)
    expect(hourly?.[8]).toBe(2)
    expect(hourly?.[23]).toBe(1)
    expect(hourly?.[0]).toBe(0)
  })

  it('survives a route whose operatingDates field is missing entirely', () => {
    // Gdyby API przestało zwracać to pole, samo `.includes()` rzuciłoby
    // TypeError w cyklu pollera i wywaliło snapshot KAŻDEJ stacji.
    const broken = { ...route({ scheduleId: 'a' }), operatingDates: undefined } as unknown as RawRoute

    expect(() => computeStationSchedule('5100', routeList([broken]), NAMES, TODAY)).not.toThrow()
  })
})

describe('computeStationRealization', () => {
  it('ignores trains whose operatingDate is not today -- /operations mixes several days in one response', () => {
    // Zmierzone na żywym API (Warszawa Zachodnia, 2026-08-28, 20:38): jedna
    // odpowiedź `/operations?stations=33506&withPlanned=true` niosła pociągi
    // z PIĘCIU dni kursowania (24-28.08) naraz, mimo że endpoint nie ma
    // parametru daty. Bez tego filtra kafelek „z potwierdzonych DZIŚ
    // przejazdów" liczyłby średnią ze zdarzeń sprzed kilku dni i nazywał ją
    // dzisiejszą -- gorsze niż brak danych, bo wygląda wiarygodnie
    // (AGENTS.md #7).
    const yesterday = train('a', [
      stop({
        stationId: '5100',
        isConfirmed: true,
        plannedDeparture: '2026-07-31T08:00:00+02:00',
        actualDeparture: '2026-07-31T08:20:00+02:00',
        departureDelayMinutes: 20,
      }),
    ])
    const today = train('b', [
      stop({
        stationId: '5100',
        isConfirmed: true,
        plannedDeparture: '2026-08-01T08:00:00+02:00',
        actualDeparture: '2026-08-01T08:02:00+02:00',
        departureDelayMinutes: 2,
      }),
    ])
    yesterday.operatingDate = '2026-07-31'

    const result = computeStationRealization('5100', [yesterday, today], TODAY)

    expect(result.averageDelaySample).toBe(1)
    expect(result.averageDelayMinutes).toBe(2)
  })

  it('averages confirmed events only and counts arrival and departure separately', () => {
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedArrival: '2026-08-01T08:00:00+02:00',
          actualArrival: '2026-08-01T08:04:00+02:00',
          arrivalDelayMinutes: 4,
          plannedDeparture: '2026-08-01T08:02:00+02:00',
          actualDeparture: '2026-08-01T08:08:00+02:00',
          departureDelayMinutes: 6,
        }),
      ]),
    ]

    const result = computeStationRealization('5100', trains, TODAY)

    expect(result.averageDelaySample).toBe(2)
    expect(result.averageDelayMinutes).toBe(5)
  })

  it('ignores unconfirmed stops even when PKP copied the plan into the actual time', () => {
    // Dokładnie ten przypadek z AGENTS.md #2: `actualDeparture` jest kopią
    // planu godziny przed odjazdem. Wliczony, zaniżałby średnią do zera.
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: false,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:00:00+02:00',
        }),
      ]),
    ]

    const result = computeStationRealization('5100', trains, TODAY)

    expect(result.averageDelaySample).toBe(0)
    expect(result.averageDelayMinutes).toBeNull()
    expect(result.punctualityPct).toBeNull()
  })

  it('excludes cancelled stops from both the average and punctuality', () => {
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          isCancelled: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T09:00:00+02:00',
          departureDelayMinutes: 60,
        }),
      ]),
    ]

    expect(computeStationRealization('5100', trains, TODAY).averageDelaySample).toBe(0)
  })

  it('counts a delay at or below the threshold as punctual, above it as not', () => {
    const trains = [5, 6].map((delay, index) =>
      train(String(index), [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:00:00+02:00',
          departureDelayMinutes: delay,
        }),
      ])
    )

    const result = computeStationRealization('5100', trains, TODAY, 5)

    expect(result.punctualitySample).toBe(2)
    expect(result.punctualityPct).toBe(50)
    expect(result.punctualityThresholdMinutes).toBe(5)
  })

  it('honours a custom punctuality threshold instead of hard-coding five minutes', () => {
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:00:00+02:00',
          departureDelayMinutes: 12,
        }),
      ]),
    ]

    expect(computeStationRealization('5100', trains, TODAY, 5).punctualityPct).toBe(0)
    expect(computeStationRealization('5100', trains, TODAY, 15).punctualityPct).toBe(100)
  })

  it('treats an early departure as zero delay, never as a negative that drags the average down', () => {
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:00:00+02:00',
          departureDelayMinutes: -3,
        }),
      ]),
      train('b', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T09:00:00+02:00',
          actualDeparture: '2026-08-01T09:00:00+02:00',
          departureDelayMinutes: 10,
        }),
      ]),
    ]

    const result = computeStationRealization('5100', trains, TODAY)

    // (0 + 10) / 2, nie (-3 + 10) / 2.
    expect(result.averageDelayMinutes).toBe(5)
    expect(result.punctualityPct).toBe(50)
  })

  it('ignores stops belonging to other stations on the same train', () => {
    const trains = [
      train('a', [
        stop({
          stationId: '4900',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T07:00:00+02:00',
          actualDeparture: '2026-08-01T07:30:00+02:00',
          departureDelayMinutes: 30,
        }),
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:02:00+02:00',
          departureDelayMinutes: 2,
        }),
      ]),
    ]

    expect(computeStationRealization('5100', trains, TODAY).averageDelayMinutes).toBe(2)
  })
})

describe('computeStationStats', () => {
  it('combines the schedule and realization passes into one snapshot payload', () => {
    const routes = routeList([
      route({
        scheduleId: 'a',
        stations: [routeStop({ stationId: '5100', departureTime: '08:00:00' }), routeStop({ stationId: '5136' })],
      }),
    ])
    const trains = [
      train('a', [
        stop({
          stationId: '5100',
          isConfirmed: true,
          plannedDeparture: '2026-08-01T08:00:00+02:00',
          actualDeparture: '2026-08-01T08:03:00+02:00',
          departureDelayMinutes: 3,
        }),
      ]),
    ]

    const { stats, insights } = computeStationStats('5100', trains, routes, NAMES, TODAY)

    expect(stats.departuresToday).toBe(1)
    expect(stats.averageDelayMinutes).toBe(3)
    expect(stats.punctualityPct).toBe(100)
    expect(insights.topDestinations[0].name).toBe('Kraków Główny')
  })
})
