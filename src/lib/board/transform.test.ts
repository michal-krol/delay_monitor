import { describe, expect, it } from 'vitest'
import { transformOperations } from './transform'
import { disruptionTrainKey } from './disruptions'
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
    isConfirmed: false,
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
  return { scheduleId, orderId, trainOrderId, operatingDate: '2026-08-01', trainStatus, stations }
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

function route(overrides: Partial<RawRoute> & { scheduleId: string; orderId: string }): RawRoute {
  return {
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    operatingDates: [],
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

  it('marks an unconfirmed stop as notStarted, with a null (not 0) delay -- isConfirmed is the only signal that matters', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('notStarted')
    expect(snapshot.departures[0].delayMinutes).toBeNull()
  })

  it('marks a confirmed stop with no resolvable delay as unknown', () => {
    // "unknown" po refaktorze znaczy wyłącznie "potwierdzone, ale bez danych
    // do policzenia opóźnienia" -- nie "jeszcze nieznane, może się nie wydarzyło".
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: true })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('unknown')
    expect(snapshot.departures[0].delayMinutes).toBeNull()
  })

  it('marks a train with trainStatus S (not started) as notStarted instead of unknown', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })], null, 'S'),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('notStarted')
  })

  it('marks a trainStatus S train as notStarted even when the API echoes plannedDeparture into actualDeparture', () => {
    // Zaobserwowane na produkcji (pociąg R1 91342, KM): dla trainStatus S PKP
    // wypełnia actualArrival/actualDeparture kopią planowego czasu -- nawet
    // dla przystanków godzinami w przyszłości, nie tylko tuż po planowym
    // odjeździe. `actualAt !== null` przestaje więc być wiarygodnym sygnałem
    // "już się wydarzyło": pociąg, który jeszcze nie wyjechał, wyglądał jak
    // punktualny (opóźnienie liczone z identycznych planned/actual wychodzi 0).
    const trains = [
      train(
        '25',
        '1',
        [
          stop({
            stationId: '5100',
            plannedDeparture: '2026-08-01T12:10:00+02:00',
            actualDeparture: '2026-08-01T12:10:00+02:00',
          }),
        ],
        null,
        'S'
      ),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('notStarted')
  })

  it('marks a not-yet-reached stop of an InProgress (P) train as enRoute, not the misleading notStarted', () => {
    // Dokładnie scenariusz zgłoszony przez usera: pociąg KOPERNIK już jedzie
    // (wyjechał z Bydgoszczy, minął kilka stacji), ale do Warszawy Centralnej
    // jeszcze nie dotarł/nie odjechał stąd -- tablica pokazywała mylące
    // "jeszcze nie wyjechał", mimo że pociąg w rzeczywistości jest w trasie.
    const trains = [
      train(
        '25',
        '1',
        [
          stop({
            stationId: '5100',
            plannedDeparture: '2026-08-01T12:10:00+02:00',
            isCancelled: false,
            isConfirmed: false,
          }),
        ],
        null,
        'P'
      ),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('enRoute')
  })

  describe('estimatedDelayMinutes', () => {
    it('estimates the delay from the confirmed stop right before an enRoute stop', () => {
      // Dokładnie scenariusz KOPERNIKA: Bydgoszcz Leśna (przystanek wcześniejszy
      // na trasie) już potwierdzona z +30 min, Warszawa Centralna jeszcze nie --
      // ale zapytanie /operations tego cyklu i tak dociągnęło Bydgoszcz Leśną
      // (patrz poller.ts, stacje "pomocnicze"), więc jest z czego liczyć.
      const trains = [
        train(
          '25',
          '1',
          [
            stop({
              stationId: 'upstream',
              plannedDeparture: '2026-08-01T11:30:00+02:00',
              actualDeparture: '2026-08-01T12:00:00+02:00',
              isConfirmed: true,
            }),
            stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false }),
          ],
          null,
          'P'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('enRoute')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBe(30)
    })

    it('is enRoute with an estimate even when trainStatus is S -- a confirmed upstream stop is stronger proof than trainStatus', () => {
      // MEDUZA (Kołobrzeg->Warszawa->Kraków): trainStatus 'S' na tym odcinku
      // nie znaczy "pociąg nie jedzie" -- Bydgoszcz Leśna już potwierdzona
      // udowadnia, że wyjechał, niezależnie od tego, co mówi trainStatus.
      const trains = [
        train(
          '25',
          '1',
          [
            stop({
              stationId: 'upstream',
              plannedDeparture: '2026-08-01T11:30:00+02:00',
              actualDeparture: '2026-08-01T12:00:00+02:00',
              isConfirmed: true,
            }),
            stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false }),
          ],
          null,
          'S'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('enRoute')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBe(30)
    })

    it('stays notStarted when trainStatus is S and the upstream stop is also unconfirmed -- genuinely has not started anywhere', () => {
      const trains = [
        train(
          '25',
          '1',
          [
            stop({ stationId: 'upstream', plannedDeparture: '2026-08-01T11:30:00+02:00', isConfirmed: false }),
            stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false }),
          ],
          null,
          'S'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('notStarted')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })

    it('is null when the preceding stop was not included in this fetch (aux station not tracked yet)', () => {
      const trains = [
        train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false })], null, 'P'),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('enRoute')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })

    it('is null when every stop within reach (whole route, here) is unconfirmed', () => {
      const trains = [
        train(
          '25',
          '1',
          [
            stop({ stationId: 'upstream', plannedDeparture: '2026-08-01T11:30:00+02:00', isConfirmed: false }),
            stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false }),
          ],
          null,
          'P'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })

    it('reaches past a couple of unconfirmed stops to find a confirmed one further back (S3 10556 scenario)', () => {
      // Warszawa Wschodnia (1 wstecz) i Warszawa Targówek (2 wstecz) jeszcze
      // niepotwierdzone -- typowe na gęstej linii SKM -- ale Warszawa Praga
      // (3 wstecz) już jest, więc stąd powinna wziąć się estymata.
      const trains = [
        train(
          '25',
          '1',
          [
            stop({
              stationId: 'praga',
              plannedDeparture: new Date(NOW.getTime() - 16 * 60000).toISOString(),
              actualDeparture: new Date(NOW.getTime() - 15 * 60000).toISOString(),
              isConfirmed: true,
            }),
            stop({ stationId: 'targowek', plannedDeparture: new Date(NOW.getTime() - 12 * 60000).toISOString(), isConfirmed: false }),
            stop({ stationId: 'wschodnia', plannedDeparture: new Date(NOW.getTime() - 8 * 60000).toISOString(), isConfirmed: false }),
            stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() + 1 * 60000).toISOString(), isConfirmed: false }),
          ],
          null,
          'S'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        [
          '25-1',
          route({
            scheduleId: '25',
            orderId: '1',
            stations: [
              routeStop({ stationId: 'praga' }),
              routeStop({ stationId: 'targowek' }),
              routeStop({ stationId: 'wschodnia' }),
              routeStop({ stationId: '5100' }),
            ],
          }),
        ],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('enRoute')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBe(1)
    })

    it('is null when the preceding stop is cancelled -- not a meaningful basis for an estimate', () => {
      const trains = [
        train(
          '25',
          '1',
          [
            stop({ stationId: 'upstream', plannedDeparture: '2026-08-01T11:30:00+02:00', isCancelled: true }),
            stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false }),
          ],
          null,
          'P'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })

    it('is always null when the stop itself is already confirmed, even if a matching upstream stop happens to exist -- never overrides a real delayMinutes', () => {
      const trains = [
        train(
          '25',
          '1',
          [
            stop({
              stationId: 'upstream',
              plannedDeparture: '2026-08-01T11:30:00+02:00',
              actualDeparture: '2026-08-01T12:00:00+02:00',
              isConfirmed: true,
            }),
            stop({
              stationId: '5100',
              plannedDeparture: '2026-08-01T12:10:00+02:00',
              actualDeparture: '2026-08-01T12:13:00+02:00',
              isConfirmed: true,
            }),
          ],
          null,
          'P'
        ),
      ]
      const routes = new Map<string, RawRoute>([
        ['25-1', route({ scheduleId: '25', orderId: '1', stations: [routeStop({ stationId: 'upstream' }), routeStop({ stationId: '5100' })] })],
      ])
      const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('delayed')
      expect(snapshot.departures[0].delayMinutes).toBe(3)
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })

    it('is null when there is no matched route at all', () => {
      const trains = [
        train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isConfirmed: false })], null, 'P'),
      ]
      const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
      expect(snapshot.departures[0].status).toBe('enRoute')
      expect(snapshot.departures[0].estimatedDelayMinutes).toBeNull()
    })
  })

  it('marks a not-yet-reached, non-cancelled stop of a partially-cancelled (Q) train as notStarted, not onTime', () => {
    // Węższa łatka (trainStatus === 'S') nie chroniłaby tego przypadku --
    // Q nigdy nie było sprawdzane. Tylko isConfirmed per przystanek chroni
    // każdy trainStatus jednakowo, nie tylko S.
    const trains = [
      train(
        '25',
        '1',
        [
          stop({
            stationId: '5100',
            plannedDeparture: '2026-08-01T12:10:00+02:00',
            actualDeparture: '2026-08-01T12:10:00+02:00',
            isCancelled: false,
            isConfirmed: false,
          }),
        ],
        null,
        'Q'
      ),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('notStarted')
  })

  it('marks a cancelled stop of a partially-cancelled (Q) train as cancelled, and a confirmed stop of the same train as delayed', () => {
    const cancelledStop = train(
      '25',
      '1',
      [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isCancelled: true })],
      null,
      'Q'
    )
    const confirmedStop = train(
      '25',
      '2',
      [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
          actualDeparture: '2026-08-01T12:13:00+02:00',
          isConfirmed: true,
        }),
      ],
      null,
      'Q'
    )
    const cancelledSnapshot = transformOperations('5100', 'X', [cancelledStop], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    const confirmedSnapshot = transformOperations('5100', 'X', [confirmedStop], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(cancelledSnapshot.departures[0].status).toBe('cancelled')
    expect(confirmedSnapshot.departures[0].status).toBe('delayed')
    expect(confirmedSnapshot.departures[0].delayMinutes).toBe(3)
  })

  it('computes delay across midnight using full dates, not time-of-day', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T23:58:00+02:00',
          actualDeparture: '2026-08-02T00:04:00+02:00',
          isConfirmed: true,
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
          isConfirmed: true,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].delayMinutes).toBe(3)
  })

  it('sorts ascending by plannedAt and caps at 40 rows within the 3h window', () => {
    const trains = Array.from({ length: 45 }, (_, i) =>
      train(String(i), '1', [
        stop({
          stationId: '5100',
          plannedDeparture: new Date(NOW.getTime() + (45 - i) * 60000).toISOString(),
        }),
      ])
    )
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(40)
    expect(snapshot.departures[0].trainNumber).toBe('44-1')
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

  it('gives past and upcoming connections independent budgets -- past ones do not eat into the upcoming cap', () => {
    const pastTrains = Array.from({ length: 3 }, (_, i) =>
      train(`past-${i}`, '1', [
        stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() - (i + 1) * 60000).toISOString() }),
      ])
    )
    const futureTrains = Array.from({ length: 45 }, (_, i) =>
      train(`future-${i}`, '1', [
        stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() + (i + 1) * 60000).toISOString() }),
      ])
    )
    const snapshot = transformOperations('5100', 'X', [...pastTrains, ...futureTrains], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)

    // 3 przeszłe (bez limitu liczbowego, tylko okno 5 min) + 40 nadchodzących
    // (limit), a nie 40 łącznie z przeszłymi zajmującymi część tego limitu.
    expect(snapshot.departures).toHaveLength(43)
    // Rosnąco po czasie -- najdawniej miniony (past-2, 3 min wstecz) pierwszy.
    expect(snapshot.departures.slice(0, 3).map((row) => row.trainNumber)).toEqual(['past-2-1', 'past-1-1', 'past-0-1'])
    expect(snapshot.departures.slice(3)).toHaveLength(40)
  })

  it('excludes departures beyond the 3h visibility window', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() + 200 * 60000).toISOString() }),
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

  it('resolves the full category name from the dictionaries.commercialCategories lookup, same pattern as carrierName', () => {
    const trains = [
      train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', commercialCategorySymbol: 'EIC' })],
    ])
    const categoryNames = { EIC: 'Express InterCity' }
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW, categoryNames)
    expect(snapshot.departures[0].categoryName).toBe('Express InterCity')
  })

  it('leaves categoryName null when the category dictionary does not know the symbol', () => {
    const trains = [
      train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const routes = new Map<string, RawRoute>([
      ['26-12345', route({ scheduleId: '26', orderId: '12345', commercialCategorySymbol: 'EIC' })],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].categoryName).toBeNull()
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

  it('reports platform and track as separate values for the matching station on the route', () => {
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
    expect(snapshot.departures[0].platform).toBe('4')
    expect(snapshot.departures[0].track).toBe('2')
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
    expect(snapshot.departures[0].track).toBeNull()
  })

  it('reports the track alone when the platform is unknown -- two independent values, not one merged string', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const routes = new Map<string, RawRoute>([
      [
        '26-12345',
        route({
          scheduleId: '26',
          orderId: '12345',
          stations: [routeStop({ stationId: '5100', departureTrack: '2' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].platform).toBeNull()
    expect(snapshot.departures[0].track).toBe('2')
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
    expect(snapshot.arrivals[0].platform).toBe('1')
    expect(snapshot.arrivals[0].track).toBe('3')
    expect(snapshot.departures[0].platform).toBe('4')
    expect(snapshot.departures[0].track).toBe('2')
  })

  it('falls back to the departure platform/track for an arrival when the route has no arrival platform (PKP fills only departure on through-stops)', () => {
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
          stations: [routeStop({ stationId: '5100', departurePlatform: '4', departureTrack: '2' })],
        }),
      ],
    ])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, routes, {}, NOW.toISOString(), NOW)
    expect(snapshot.arrivals[0].platform).toBe('4')
    expect(snapshot.arrivals[0].track).toBe('2')
    expect(snapshot.departures[0].platform).toBe('4')
    expect(snapshot.departures[0].track).toBe('2')
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
    expect(snapshot.departures[0].track).toBeNull()
  })

  it('marks hasDisruption true when the train (scheduleId+orderId+operatingDate) is in the disrupted set', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const disrupted = new Set([disruptionTrainKey('26', '12345', '2026-08-01')])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, disrupted)
    expect(snapshot.departures[0].hasDisruption).toBe(true)
  })

  it('marks hasDisruption false when scheduleId/orderId match but operatingDate does not', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const disrupted = new Set([disruptionTrainKey('26', '12345', '2026-08-02')])
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, disrupted)
    expect(snapshot.departures[0].hasDisruption).toBe(false)
  })

  it('defaults hasDisruption to false when the disrupted-trains set is omitted', () => {
    const trains = [train('26', '12345', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].hasDisruption).toBe(false)
  })
})

describe('transformOperations -- przystanki pośrednie („przez…")', () => {
  const VIA_NAMES = {
    '5100': 'Warszawa Centralna',
    A: 'Pruszków',
    B: 'Opoczno',
    C: 'Kielce',
    D: 'Miechów',
    '5136': 'Kraków Główny',
  }

  /** Trasa 5100 -> A -> B -> C -> D -> 5136, ta sama dla odjazdów i przyjazdów. */
  function longRoute(): Map<string, RawRoute> {
    return new Map([
      [
        '30-1',
        route({
          scheduleId: '30',
          orderId: '1',
          stations: ['5100', 'A', 'B', 'C', 'D', '5136'].map((stationId) => routeStop({ stationId })),
        }),
      ],
    ])
  }

  it('lists intermediate stops after this station, excluding the terminus shown as headsign', () => {
    const trains = [train('30', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, VIA_NAMES, longRoute(), {}, NOW.toISOString(), NOW)

    expect(snapshot.departures[0].headsign).toBe('Kraków Główny')
    expect(snapshot.departures[0].via).toEqual(['Pruszków', 'Opoczno', 'Kielce'])
    // A, B, C, D to cztery przystanki pośrednie; trzy zmieściły się w `via`.
    expect(snapshot.departures[0].viaRemaining).toBe(1)
  })

  it('lists stops already travelled for arrivals, still in travel order', () => {
    const trains = [train('30', '1', [stop({ stationId: 'D', plannedArrival: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('D', 'X', trains, VIA_NAMES, longRoute(), {}, NOW.toISOString(), NOW)

    expect(snapshot.arrivals[0].headsign).toBe('Warszawa Centralna')
    // Odcinek między originem (wykluczonym, bo to headsign) a tą stacją.
    expect(snapshot.arrivals[0].via).toEqual(['Pruszków', 'Opoczno', 'Kielce'])
    expect(snapshot.arrivals[0].viaRemaining).toBe(0)
  })

  it('reports an empty via list when the train runs straight to the terminus', () => {
    const routes = new Map([
      ['30-1', route({ scheduleId: '30', orderId: '1', stations: [routeStop({ stationId: '5100' }), routeStop({ stationId: '5136' })] })],
    ])
    const trains = [train('30', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, VIA_NAMES, routes, {}, NOW.toISOString(), NOW)

    expect(snapshot.departures[0].via).toEqual([])
    expect(snapshot.departures[0].viaRemaining).toBe(0)
  })

  it('reports an empty via list when there is no matching route -- empty means "unknown", never "runs direct"', () => {
    const trains = [train('30', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, VIA_NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)

    expect(snapshot.departures[0].via).toEqual([])
    expect(snapshot.departures[0].headsign).toBeNull()
  })
})

describe('transformOperations -- PLAN / PROGNOZA / FAKT', () => {
  it('exposes a prediction for an unconfirmed stop without ever filling actualAt', () => {
    const planned = '2026-08-01T12:10:00+02:00'
    const trains = [
      train('40', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: planned,
          // PKP potrafi wpisać tu własną projekcję dla niepotwierdzonego przystanku.
          actualDeparture: '2026-08-01T12:13:00+02:00',
          isConfirmed: false,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)
    const row = snapshot.departures[0]

    expect(row.predictedAt).toBe('2026-08-01T12:13:00+02:00')
    // Niepotwierdzony przystanek nie ma FAKTU ani opóźnienia -- prognoza nie
    // awansuje do żadnego z nich (AGENTS.md #2).
    expect(row.delayMinutes).toBeNull()
    expect(row.status).toBe('notStarted')
  })

  it('drops the prediction once the stop is confirmed -- then the fact is what counts', () => {
    const trains = [
      train('41', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
          actualDeparture: '2026-08-01T12:13:00+02:00',
          isConfirmed: true,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)

    expect(snapshot.departures[0].predictedAt).toBeNull()
    expect(snapshot.departures[0].actualAt).toBe('2026-08-01T12:13:00+02:00')
    expect(snapshot.departures[0].delayMinutes).toBe(3)
  })

  it('ignores the whole-day-offset artefact PKP writes for far-ahead stops', () => {
    const trains = [
      train('42', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
          actualDeparture: '2026-08-02T12:10:00+02:00',
          isConfirmed: false,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW)

    expect(snapshot.departures[0].predictedAt).toBeNull()
  })
})

describe('transformOperations — rozkład jako źródło listy', () => {
  const TODAY = '2026-08-01'
  const source = (routes: RawRoute[]) => ({ routes, todayIsoDate: TODAY })

  /** Trasa przez 5100 z godziną odjazdu w oknie widoczności (NOW = 12:00 czasu warszawskiego). */
  function routeThroughStation(overrides: Partial<RawRoute> = {}): RawRoute {
    return route({
      scheduleId: '2026',
      orderId: '77',
      trainOrderId: '77',
      carrierCode: 'KM',
      commercialCategorySymbol: 'REG',
      nationalNumber: '91342',
      operatingDates: [TODAY],
      stations: [
        routeStop({ stationId: '5100', departureTime: '12:30:00', departurePlatform: '4', departureTrack: '2' }),
        routeStop({ stationId: '5136', arrivalTime: '13:40:00' }),
      ],
      ...overrides,
    })
  }

  it('buduje wiersz z samego rozkładu, gdy realizacja nie zna tego kursu', () => {
    // Sedno przepięcia: 27-31.08.2026 /operations zwracało wyłącznie pociągi
    // sprzed kilku dni, więc takie kursy nie miały jak trafić na tablicę.
    const snapshot = transformOperations(
      '5100', 'X', [], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([routeThroughStation()])
    )

    expect(snapshot.departures).toHaveLength(1)
    const row = snapshot.departures[0]
    expect(row.plannedAt).toBe('2026-08-01T10:30:00.000Z')
    expect(row.platform).toBe('4')
    expect(row.track).toBe('2')
    expect(row.carrier).toBe('KM')
    expect(row.headsign).toBe('Kraków Główny')
    // Bez realizacji nie wiadomo nic o ruchu — i to musi być widoczne.
    expect(row.delayMinutes).toBeNull()
    expect(row.actualAt).toBeNull()
    expect(row.predictedAt).toBeNull()
    expect(row.status).toBe('notStarted')
  })

  it('nakłada realizację na wiersz z rozkładu, gdy oba źródła znają kurs', () => {
    const trains = [
      train('2026', '99999', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:30:00+02:00',
          actualDeparture: '2026-08-01T12:37:00+02:00',
          departureDelayMinutes: 7,
          isConfirmed: true,
        }),
      ], '77'),
    ]
    const snapshot = transformOperations(
      '5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([routeThroughStation()])
    )

    expect(snapshot.departures).toHaveLength(1)
    const row = snapshot.departures[0]
    expect(row.delayMinutes).toBe(7)
    expect(row.status).toBe('delayed')
    // Identyfikator przejazdu pochodzi z realizacji -- to nim posługuje się /api/train.
    expect(row.orderId).toBe('99999')
  })

  it('pomija trasę, która dziś nie kursuje', () => {
    const snapshot = transformOperations(
      '5100', 'X', [], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([routeThroughStation({ operatingDates: ['2026-08-02'] })])
    )

    expect(snapshot.departures).toHaveLength(0)
  })

  it('pomija trasę, która nie przechodzi przez tę stację', () => {
    const other = routeThroughStation({
      stations: [routeStop({ stationId: '4900', departureTime: '12:30:00' })],
    })
    const snapshot = transformOperations(
      '5100', 'X', [], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([other])
    )

    expect(snapshot.departures).toHaveLength(0)
  })

  it('dokleja kurs z realizacji, któremu nie dopasowano żadnej trasy', () => {
    // Polisa, nie reguła: na zmierzonych danych (26 i 27.08, Warszawa Centralna)
    // takich kursów było zero. Ma gwarantować, że nowa ścieżka nigdy nie pokaże
    // mniej niż stara.
    const trains = [
      train('2026', '12345', [
        stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:20:00+02:00' }),
      ]),
    ]
    const snapshot = transformOperations(
      '5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([])
    )

    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.departures[0].trainNumber).toBe('2026-12345')
  })

  it('nie duplikuje kursu obecnego w obu źródłach', () => {
    const trains = [
      train('2026', '99999', [
        stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:30:00+02:00', isConfirmed: true }),
      ], '77'),
    ]
    const snapshot = transformOperations(
      '5100', 'X', trains, NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([routeThroughStation()])
    )

    expect(snapshot.departures).toHaveLength(1)
  })

  it('składa przyjazd z godziny przyjazdowej trasy, nie odjazdowej', () => {
    const terminus = routeThroughStation({
      stations: [
        routeStop({ stationId: '5136', departureTime: '11:00:00' }),
        routeStop({ stationId: '5100', arrivalTime: '12:40:00', arrivalPlatform: '1' }),
      ],
    })
    const snapshot = transformOperations(
      '5100', 'X', [], NAMES, NO_ROUTES, {}, NOW.toISOString(), NOW, {}, new Set(),
      undefined, [], source([terminus])
    )

    expect(snapshot.departures).toHaveLength(0)
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.arrivals[0].plannedAt).toBe('2026-08-01T10:40:00.000Z')
    expect(snapshot.arrivals[0].headsign).toBe('Kraków Główny')
  })
})
