import { describe, expect, it } from 'vitest'
import { collectUpstreamCandidates, findPrecedingStationId, MAX_AUX_STATIONS, UPSTREAM_CANDIDATE_LIMIT } from './upstreamEstimate'
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
  trainStatus: string | null = 'P',
  trainOrderId: string | null = null
): RawTrainOperation {
  return { scheduleId, orderId, trainOrderId, operatingDate: '2026-08-01', trainStatus, stations }
}

function routeStop(stationId: string): RawRouteStop {
  return {
    stationId,
    arrivalPlatform: null,
    arrivalTrack: null,
    departurePlatform: null,
    departureTrack: null,
    arrivalTime: null,
    departureTime: null,
    arrivalDay: null,
    departureDay: null,
  }
}

function route(scheduleId: string, orderId: string, stationIds: string[]): RawRoute {
  return {
    scheduleId,
    orderId,
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    stations: stationIds.map(routeStop),
  }
}

function routesMap(...routes: RawRoute[]): Map<string, RawRoute> {
  return new Map(routes.map((r) => [`${r.scheduleId}-${r.orderId}`, r]))
}

describe('findPrecedingStationId', () => {
  it('returns the station right before the given one', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationId(r, 'B')).toBe('A')
    expect(findPrecedingStationId(r, 'C')).toBe('B')
  })

  it('returns null for the first station on the route (nothing before it)', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationId(r, 'A')).toBeNull()
  })

  it('returns null when the station is not on the route at all', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationId(r, 'Z')).toBeNull()
  })

  it('returns null when there is no matched route', () => {
    expect(findPrecedingStationId(undefined, 'A')).toBeNull()
  })

  it('resolves against the first occurrence when a station appears twice (loop line)', () => {
    const r = route('1', '1', ['A', 'B', 'A', 'C'])
    expect(findPrecedingStationId(r, 'A')).toBeNull()
  })
})

describe('collectUpstreamCandidates', () => {
  it('picks the preceding station for an enRoute (unconfirmed, train already started) stop', () => {
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })])]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    const result = collectUpstreamCandidates(['B'], trains, routes)

    expect(result).toEqual(new Set(['A']))
  })

  it('ignores a confirmed stop -- nothing to estimate, it already has real data', () => {
    const trains = [
      train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z', isConfirmed: true })]),
    ]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    expect(collectUpstreamCandidates(['B'], trains, routes)).toEqual(new Set())
  })

  it('ignores a cancelled stop', () => {
    const trains = [
      train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z', isCancelled: true })]),
    ]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    expect(collectUpstreamCandidates(['B'], trains, routes)).toEqual(new Set())
  })

  it('ignores a train that has not started yet (trainStatus S), even if unconfirmed', () => {
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })], 'S')]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    expect(collectUpstreamCandidates(['B'], trains, routes)).toEqual(new Set())
  })

  it('skips a stop with no matched route -- nothing to walk back on', () => {
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })])]

    expect(collectUpstreamCandidates(['B'], trains, new Map())).toEqual(new Set())
  })

  it('skips the first stop on a route -- nothing precedes it', () => {
    const trains = [train('1', '1', [stop({ stationId: 'A', plannedDeparture: '2026-08-01T12:00:00Z' })])]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    expect(collectUpstreamCandidates(['A'], trains, routes)).toEqual(new Set())
  })

  it('does not add an upstream station that is already being observed directly', () => {
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })])]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    // 'A' jest już obserwowana wprost -- nie ma sensu dokładać jej jako "pomocniczą".
    expect(collectUpstreamCandidates(['A', 'B'], trains, routes)).toEqual(new Set())
  })

  it('keeps only the nearest UPSTREAM_CANDIDATE_LIMIT departures per station, by plannedAt', () => {
    const base = new Date('2026-08-01T12:00:00Z').getTime()
    const trains = Array.from({ length: UPSTREAM_CANDIDATE_LIMIT + 2 }, (_, i) =>
      train(String(i), '1', [
        stop({ stationId: 'B', plannedDeparture: new Date(base + i * 60000).toISOString() }),
      ])
    )
    const routes = routesMap(
      ...Array.from({ length: UPSTREAM_CANDIDATE_LIMIT + 2 }, (_, i) => route(String(i), '1', [`upstream-${i}`, 'B']))
    )

    const result = collectUpstreamCandidates(['B'], trains, routes)

    expect(result.size).toBe(UPSTREAM_CANDIDATE_LIMIT)
    // Najbliższe w czasie (najmniejsze i) wygrywają.
    const expected = Array.from({ length: UPSTREAM_CANDIDATE_LIMIT }, (_, i) => `upstream-${i}`)
    expect(result).toEqual(new Set(expected))
  })

  it('tracks departures and arrivals independently -- both can contribute up to the limit', () => {
    const departure = train('dep', '1', [
      stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' }),
    ])
    const arrival = train('arr', '1', [stop({ stationId: 'B', plannedArrival: '2026-08-01T12:00:00Z' })])
    const routes = routesMap(route('dep', '1', ['A1', 'B']), route('arr', '1', ['A2', 'B']))

    const result = collectUpstreamCandidates(['B'], [departure, arrival], routes)

    expect(result).toEqual(new Set(['A1', 'A2']))
  })

  it('respects the global MAX_AUX_STATIONS cap across many observed stations', () => {
    const stationIds = Array.from({ length: MAX_AUX_STATIONS + 5 }, (_, i) => `station-${i}`)
    const trains = stationIds.map((stationId, i) =>
      train(String(i), '1', [stop({ stationId, plannedDeparture: '2026-08-01T12:00:00Z' })])
    )
    const routes = routesMap(...stationIds.map((stationId, i) => route(String(i), '1', [`upstream-${i}`, stationId])))

    const result = collectUpstreamCandidates(stationIds, trains, routes)

    expect(result.size).toBeLessThanOrEqual(MAX_AUX_STATIONS)
  })
})
