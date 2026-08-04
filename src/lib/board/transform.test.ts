import { describe, expect, it } from 'vitest'
import { transformOperations } from './transform'
import type { RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'

function stop(overrides: Partial<RawOperationStation> & { stationId: string }): RawOperationStation {
  return {
    plannedArrival: null,
    actualArrival: null,
    plannedDeparture: null,
    actualDeparture: null,
    arrivalDelayMinutes: null,
    departureDelayMinutes: null,
    isCancelled: false,
    ...overrides,
  }
}

function train(
  scheduleId: string,
  orderId: string,
  stations: RawOperationStation[],
  trainOrderId: string | null = null,
  trainStatus: string | null = null
): RawTrainOperation {
  return { scheduleId, orderId, trainOrderId, trainStatus, stations }
}

function routeStop(overrides: Partial<RawRouteStop> & { stationId: string }): RawRouteStop {
  return {
    arrivalPlatform: null,
    arrivalTrack: null,
    departurePlatform: null,
    departureTrack: null,
    ...overrides,
  }
}

function route(overrides: Partial<RawRoute> & { scheduleId: string; orderId: string }): RawRoute {
  return {
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    stations: [],
    ...overrides,
  }
}

const NAMES = { '5100': 'Warszawa Centralna', '5136': 'Kraków Główny', '4900': 'Wrocław Główny' }
const NO_ROUTES = new Map<string, RawRoute>()
const NOW = new Date('2026-08-01T12:00:00+02:00')

describe('transformOperations', () => {
  it('marks a cancelled train as cancelled even without actual times', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isCancelled: true })]),
    ]
    const snapshot = transformOperations('5100', 'Warszawa Centralna', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('cancelled')
  })

  it('marks a train with no real-time data as unknown', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('unknown')
  })

  it('marks a train with trainStatus S (not started) as notStarted instead of unknown', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })], null, 'S'),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('notStarted')
  })

  it('computes delay across midnight using full dates, not time-of-day', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T23:58:00+02:00',
          actualDeparture: '2026-08-02T00:04:00+02:00',
        }),
      ]),
    ]
    const at = new Date('2026-08-01T23:59:00+02:00')
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, at.toISOString(), at)
    expect(snapshot.departures[0].delayMinutes).toBe(6)
    expect(snapshot.departures[0].status).toBe('delayed')
  })

  it('puts a terminus arrival (last stop on the route) only in arrivals, headsign = route origin', () => {
    // Bez fullRoutes=true /operations niesie już tylko jeden przystanek na
    // zapytaną stację — origin/destination („Kierunek") pochodzi z
    // dopasowanej trasy /schedules (fullRoute=true, cache 24h), nie z
    // train.stations. Patrz client.ts.
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedArrival: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '25-1',
        route({
          scheduleId: '25',
          orderId: '1',
          stations: [routeStop({ stationId: '5136' }), routeStop({ stationId: '5100' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.arrivals[0].headsign).toBe('Kraków Główny')
    expect(snapshot.departures).toHaveLength(0)
  })

  it('puts an origin departure (first stop on the route) only in departures, headsign = route destination', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '25-1',
        route({
          scheduleId: '25',
          orderId: '1',
          stations: [routeStop({ stationId: '5100' }), routeStop({ stationId: '4900' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.departures[0].headsign).toBe('Wrocław Główny')
    expect(snapshot.arrivals).toHaveLength(0)
  })

  it('shows an intermediate stop in both departures and arrivals, each with the correct end of the route as headsign', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedArrival: '2026-08-01T12:05:00+02:00',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
        }),
      ]),
    ]
    const routes = new Map<string, RawRoute>([
      [
        '25-1',
        route({
          scheduleId: '25',
          orderId: '1',
          stations: [routeStop({ stationId: '5136' }), routeStop({ stationId: '5100' }), routeStop({ stationId: '4900' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.departures[0].headsign).toBe('Wrocław Główny')
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.arrivals[0].headsign).toBe('Kraków Główny')
  })

  it('falls back to the raw station id when the name dictionary is missing an entry', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:00:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '25-1',
        route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: '5100' }), routeStop({ stationId: '9999' })] }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, {}, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].headsign).toBe('9999')
  })

  it('shows null headsign when no route is matched, letting the UI decide the "—" fallback', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].headsign).toBeNull()
  })

  it('shows null headsign when the matched route has an empty stations list', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([['25-1', route({ scheduleId: '25', orderId: '1', stations: [] })]])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].headsign).toBeNull()
  })

  it('trusts the API delay value over the computed fallback', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
          actualDeparture: '2026-08-01T12:20:00+02:00',
          departureDelayMinutes: 3,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].delayMinutes).toBe(3)
  })

  it('sorts ascending by plannedAt and caps at 20 rows within a 2h window', () => {
    const trains = Array.from({ length: 25 }, (_, i) =>
      train(String(i), '1', [
        stop({
          stationId: '5100',
          plannedDeparture: new Date(NOW.getTime() + (25 - i) * 60000).toISOString(),
        }),
      ])
    )
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(20)
    expect(snapshot.departures[0].trainNumber).toBe('24-1')
    expect(new Date(snapshot.departures[0].plannedAt).getTime()).toBeLessThan(
      new Date(snapshot.departures[1].plannedAt).getTime()
    )
  })

  it('includes a departure planned up to 5 minutes in the past', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() - 4 * 60000).toISOString() })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(1)
  })

  it('excludes a departure planned more than 5 minutes in the past', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() - 6 * 60000).toISOString() })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(0)
  })

  it('excludes departures more than 2 hours in the future', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString() }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(0)
  })

  it('ignores trains that never stop at the requested station', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5136', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(0)
    expect(snapshot.arrivals).toHaveLength(0)
  })

  it('populates carrier and category from the matching route when available', () => {
    const trains = [
      train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].carrier).toBe('PKP_IC')
    expect(snapshot.departures[0].category).toBe('EIC')
    expect(snapshot.departures[0].carrierName).toBeNull()
  })

  it('resolves the full carrier name from the dictionaries.carriers lookup', () => {
    const trains = [
      train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', carrierCode: 'PR' })],
    ])
    const carrierNames = { PR: 'POLREGIO S.A.' }
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, carrierNames, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].carrierName).toBe('POLREGIO S.A.')
  })

  it('leaves carrier and category empty when no matching route is found', () => {
    const trains = [
      train('26', '99999', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].carrier).toBe('')
    expect(snapshot.departures[0].category).toBe('')
    expect(snapshot.departures[0].trainLabel).toBe('26-99999')
    expect(snapshot.departures[0].carrierName).toBeNull()
  })

  it('uses route.name verbatim as trainLabel when present', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', carrierCode: 'IC', commercialCategorySymbol: 'EIC', name: 'EIC Grunwald' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].trainLabel).toBe('EIC Grunwald')
  })

  it('combines category and nationalNumber as trainLabel when name is absent', () => {
    const trains = [train('26', '67890', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      ['26-67890', route({ scheduleId: '26', orderId: '67890', carrierCode: 'KM', commercialCategorySymbol: 'REG', nationalNumber: 'S1' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].trainLabel).toBe('REG S1')
  })

  it('falls back to category + internal id as trainLabel when neither name nor nationalNumber is present', () => {
    const trains = [train('26', '11111', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      ['26-11111', route({ scheduleId: '26', orderId: '11111', carrierCode: 'IC', commercialCategorySymbol: 'TLK' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].trainLabel).toBe('TLK 26-11111')
  })

  it('combines platform and track for the matching station on the route', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '26-12345',
        route({
          scheduleId: '26',
          orderId: '12345',
          stations: [routeStop({ stationId: '5100', departurePlatform: '4', departureTrack: '2' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].platform).toBe('4/2')
  })

  it('shows only the platform when the track is unknown', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '26-12345',
        route({
          scheduleId: '26',
          orderId: '12345',
          stations: [routeStop({ stationId: '5100', departurePlatform: '4' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].platform).toBe('4')
  })

  it('uses arrival platform/track for arrivals and departure platform/track for departures at the same stop', () => {
    const trains = [
      train('26', '12345', [
        stop({
          stationId: '5100',
          plannedArrival: '2026-08-01T12:05:00+02:00',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
        }),
      ]),
    ]
    const routes = new Map<string, RawRoute>([
      [
        '26-12345',
        route({
          scheduleId: '26',
          orderId: '12345',
          stations: [
            routeStop({ stationId: '5100', arrivalPlatform: '1', arrivalTrack: '3', departurePlatform: '4', departureTrack: '2' }),
          ],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.arrivals[0].platform).toBe('1/3')
    expect(snapshot.departures[0].platform).toBe('4/2')
  })

  it('joins to the route via trainOrderId when operations.orderId is a per-instance id that does not match the route', () => {
    // Wzorzec potwierdzony na żywych danych: /operations zwraca orderId
    // jako identyfikator konkretnego przejazdu, a prawdziwym kluczem
    // wspólnym z /schedules jest trainOrderId (patrz RouteDto.trainOrderId
    // w swaggerze). Dopasowanie po samym scheduleId-orderId gubi trasę.
    const trains = [
      train('26', '366302732', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })], '12345'),
    ]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', carrierCode: 'IC', name: 'KASZUB' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].trainLabel).toBe('KASZUB')
    expect(snapshot.departures[0].carrier).toBe('IC')
  })

  it('leaves platform null when the route has no matching station stop', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([['26-12345', route({ scheduleId: '26', orderId: '12345' })]])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].platform).toBeNull()
  })
})
