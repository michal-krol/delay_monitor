import { describe, expect, it } from 'vitest'
import {
  collectUpstreamCandidates,
  findPrecedingStationIds,
  MAX_AUX_STATIONS,
  UPSTREAM_CANDIDATE_LIMIT,
  UPSTREAM_LOOKBACK_HOPS,
} from './upstreamEstimate'
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

describe('findPrecedingStationIds', () => {
  it('returns the station right before the given one, closest first, when limit is 1', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationIds(r, 'B', 1)).toEqual(['A'])
    expect(findPrecedingStationIds(r, 'C', 1)).toEqual(['B'])
  })

  it('returns up to `limit` stations, closest first', () => {
    const r = route('1', '1', ['A', 'B', 'C', 'D', 'E'])
    expect(findPrecedingStationIds(r, 'E', 3)).toEqual(['D', 'C', 'B'])
  })

  it('stops at the start of the route when limit exceeds how many stations precede it', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationIds(r, 'C', 5)).toEqual(['B', 'A'])
  })

  it('returns an empty list for the first station on the route (nothing before it)', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationIds(r, 'A', 5)).toEqual([])
  })

  it('returns an empty list when the station is not on the route at all', () => {
    const r = route('1', '1', ['A', 'B', 'C'])
    expect(findPrecedingStationIds(r, 'Z', 5)).toEqual([])
  })

  it('returns an empty list when there is no matched route', () => {
    expect(findPrecedingStationIds(undefined, 'A', 5)).toEqual([])
  })

  it('resolves against the first occurrence when a station appears twice (loop line)', () => {
    const r = route('1', '1', ['A', 'B', 'A', 'C'])
    expect(findPrecedingStationIds(r, 'A', 5)).toEqual([])
  })
})

describe('collectUpstreamCandidates', () => {
  it('picks the preceding station for an enRoute (unconfirmed, train already started) stop', () => {
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })])]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    const result = collectUpstreamCandidates(['B'], trains, routes)

    expect(result).toEqual(new Set(['A']))
  })

  it('collects UPSTREAM_LOOKBACK_HOPS stations back, not just the immediate predecessor', () => {
    // Scenariusz S3 10556: przystanek bezpośrednio przed obserwowaną stacją
    // sam jeszcze nie jest potwierdzony (typowe na gęstej linii) -- trzeba
    // sięgnąć dalej wstecz, nie tylko o jeden.
    const stationIds = Array.from({ length: UPSTREAM_LOOKBACK_HOPS + 2 }, (_, i) => `S${i}`)
    const trains = [train('1', '1', [stop({ stationId: 'target', plannedDeparture: '2026-08-01T12:00:00Z' })])]
    const routes = routesMap(route('1', '1', [...stationIds, 'target']))

    const result = collectUpstreamCandidates(['target'], trains, routes)

    // Najbliższe UPSTREAM_LOOKBACK_HOPS stacje przed "target", nie wszystkie.
    const expected = stationIds.slice(-UPSTREAM_LOOKBACK_HOPS)
    expect(result).toEqual(new Set(expected))
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

  it('still checks upstream even when trainStatus is S -- it can be stale/differently-scoped for a train that has genuinely started elsewhere', () => {
    // Np. MEDUZA (Kołobrzeg->Warszawa->Kraków): odcinek za Warszawą bywa
    // osobnym scheduleId/orderId z własnym trainStatus 'S', mimo że pociąg
    // fizycznie jedzie od godzin. isConfirmed przystanku poprzedniego jest
    // jedynym w pełni zaufanym dowodem (AGENTS.md #2) -- trainStatus nie
    // powinien blokować samo ZAPYTANIE o niego.
    const trains = [train('1', '1', [stop({ stationId: 'B', plannedDeparture: '2026-08-01T12:00:00Z' })], 'S')]
    const routes = routesMap(route('1', '1', ['A', 'B', 'C']))

    expect(collectUpstreamCandidates(['B'], trains, routes)).toEqual(new Set(['A']))
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
