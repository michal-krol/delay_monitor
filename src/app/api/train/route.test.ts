import { describe, expect, it, vi } from 'vitest'
import { PkpApiError } from '@/lib/pkp/client'

const getTrainDetail = vi.fn()

vi.mock('@/lib/board/instance', () => ({
  client: { getTrainDetail: (...args: [string, string, string]) => getTrainDetail(...args) },
}))

function stubDetail(overrides: Partial<Parameters<typeof getTrainDetail.mockResolvedValueOnce>[0]> = {}) {
  getTrainDetail.mockResolvedValueOnce({
    operation: {
      scheduleId: '2026',
      orderId: '1',
      trainOrderId: null,
      operatingDate: '2026-08-01',
      trainStatus: 'P',
      stations: [
        {
          stationId: '33605',
          plannedArrival: null,
          actualArrival: null,
          plannedDeparture: '2026-08-01T12:00:00.000Z',
          actualDeparture: '2026-08-01T12:07:00.000Z',
          arrivalDelayMinutes: null,
          departureDelayMinutes: 7,
          isCancelled: false,
          isConfirmed: true,
        },
      ],
    },
    route: {
      scheduleId: '2026',
      orderId: '1',
      trainOrderId: null,
      carrierCode: 'IC',
      commercialCategorySymbol: 'EIC',
      name: 'EIC Grunwald',
      nationalNumber: null,
      stations: [{ stationId: '33605', arrivalPlatform: null, arrivalTrack: null, departurePlatform: '4', departureTrack: '2' }],
    },
    stationNames: { '33605': 'Warszawa Centralna' },
    ...overrides,
  })
}

describe('GET /api/train', () => {
  it('returns 400 when a required parameter is missing', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=1'))
    expect(response.status).toBe(400)
    expect(getTrainDetail).not.toHaveBeenCalled()
  })

  it('rejects malformed scheduleId/orderId/operatingDate without echoing the input', async () => {
    const { GET } = await import('./route')

    for (const bad of [
      'scheduleId=abc&orderId=1&operatingDate=2026-08-01',
      'scheduleId=2026&orderId=1%3B DROP&operatingDate=2026-08-01',
      'scheduleId=2026&orderId=1&operatingDate=not-a-date',
      'scheduleId=2026&orderId=1&operatingDate=2026-8-1',
    ]) {
      const response = await GET(new Request(`http://localhost/api/train?${bad}`))
      const body = await response.json()
      expect(response.status, `powinno odrzucic: ${bad}`).toBe(400)
      expect(JSON.stringify(body)).not.toContain('DROP')
    }
    expect(getTrainDetail).not.toHaveBeenCalled()
  })

  it('merges the operation and route into a per-stop list with resolved station names', async () => {
    stubDetail()
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=1&operatingDate=2026-08-01'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.carrierCode).toBe('IC')
    expect(body.routeName).toBe('EIC Grunwald')
    expect(body.stops).toEqual([
      {
        stationId: '33605',
        stationName: 'Warszawa Centralna',
        plannedArrival: null,
        actualArrival: null,
        arrivalDelayMinutes: null,
        plannedDeparture: '2026-08-01T12:00:00.000Z',
        actualDeparture: '2026-08-01T12:07:00.000Z',
        departureDelayMinutes: 7,
        isCancelled: false,
        isConfirmed: true,
        platform: '4/2',
        hasTrainStarted: false,
      },
    ])
  })

  it('still returns stops (without platform/track) when there is no matching route', async () => {
    stubDetail({ route: null })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=2&operatingDate=2026-08-01'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.carrierCode).toBeNull()
    expect(body.stops[0].platform).toBeNull()
    expect(body.stops[0].stationName).toBe('Warszawa Centralna')
  })

  it('falls back to the raw station id when no name is known', async () => {
    stubDetail({ stationNames: {} })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=3&operatingDate=2026-08-01'))
    const body = await response.json()

    expect(body.stops[0].stationName).toBe('33605')
  })

  it('maps a 404 from PKP to a clean not-found response', async () => {
    getTrainDetail.mockRejectedValueOnce(new PkpApiError('Nie znaleziono przejazdu', 404))
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=4&operatingDate=2026-08-01'))
    expect(response.status).toBe(404)
  })

  it('maps an upstream 5xx to a 502 instead of leaking the PKP status', async () => {
    getTrainDetail.mockRejectedValueOnce(new PkpApiError('Błąd serwera PKP', 503))
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=5&operatingDate=2026-08-01'))
    expect(response.status).toBe(502)
  })

  it('computes per-stop delay from the route schedule when the realization carries only actual times (the real shape of /operations/train/... on live)', async () => {
    // Sprawdzone bezpośrednio na żywym API: /operations/train/{scheduleId}/{orderId}/{operatingDate}
    // nie niesie ani planowego czasu, ani opóźnienia -- tylko faktyczny czas
    // i isConfirmed. Ten test odtwarza dokładnie ten kształt (bez pól planned*/
    // *DelayMinutes na operacji) i sprawdza, że /api/train mimo to poprawnie
    // liczy opóźnienie z trasy rozkładowej, przystanek po przystanku.
    getTrainDetail.mockResolvedValueOnce({
      operation: {
        scheduleId: '2026',
        orderId: '7',
        trainOrderId: null,
        operatingDate: '2026-08-01',
        trainStatus: 'P',
        stations: [
          { stationId: 'A', plannedArrival: null, actualArrival: null, plannedDeparture: null, actualDeparture: '2026-08-01T10:00:00+02:00', arrivalDelayMinutes: null, departureDelayMinutes: null, isCancelled: false, isConfirmed: true },
          { stationId: 'B', plannedArrival: null, actualArrival: '2026-08-01T10:20:00+02:00', plannedDeparture: null, actualDeparture: '2026-08-01T10:22:00+02:00', arrivalDelayMinutes: null, departureDelayMinutes: null, isCancelled: false, isConfirmed: true },
          { stationId: 'C', plannedArrival: null, actualArrival: '2026-08-01T10:43:00+02:00', plannedDeparture: null, actualDeparture: null, arrivalDelayMinutes: null, departureDelayMinutes: null, isCancelled: false, isConfirmed: true },
        ],
      },
      route: {
        scheduleId: '2026',
        orderId: '7',
        trainOrderId: null,
        carrierCode: 'IC',
        commercialCategorySymbol: 'EIC',
        name: 'Test',
        nationalNumber: null,
        stations: [
          { stationId: 'A', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: null, departureTime: '10:00:00', arrivalDay: null, departureDay: null },
          { stationId: 'B', arrivalPlatform: null, arrivalTrack: null, departurePlatform: null, departureTrack: null, arrivalTime: '10:20:00', departureTime: '10:22:00', arrivalDay: null, departureDay: null },
          { stationId: 'C', arrivalPlatform: '2', arrivalTrack: '1', departurePlatform: null, departureTrack: null, arrivalTime: '10:40:00', departureTime: null, arrivalDay: null, departureDay: null },
        ],
      },
      stationNames: { A: 'Stacja A', B: 'Stacja B', C: 'Stacja C' },
    })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=7&operatingDate=2026-08-01'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.stops.map((s: { stationId: string; arrivalDelayMinutes: number | null; departureDelayMinutes: number | null }) => [s.stationId, s.arrivalDelayMinutes, s.departureDelayMinutes])).toEqual([
      ['A', null, 0],
      ['B', 0, 0],
      ['C', 3, null],
    ])
    expect(body.stops[2].platform).toBe('2/1')
  })

  it('reports null delay (not a fabricated 0) for an unconfirmed stop whose actual time echoes the plan -- the real shape of a not-yet-started (trainStatus S) train on live', async () => {
    // Zaobserwowane na produkcji (R1 91342, KM): dla trainStatus S PKP nie ma
    // pól isConfirmed/*DelayMinutes na przystanku w ogóle, a actualDeparture
    // jest identyczne z planowym czasem trasy. /api/train (przez
    // buildTrainDetailStops) nie może dać się na to nabrać.
    getTrainDetail.mockResolvedValueOnce({
      operation: {
        scheduleId: '2026',
        orderId: '8',
        trainOrderId: null,
        operatingDate: '2026-08-06',
        trainStatus: 'S',
        stations: [
          { stationId: 'A', plannedArrival: null, actualArrival: null, plannedDeparture: null, actualDeparture: '2026-08-06T17:54:00', arrivalDelayMinutes: null, departureDelayMinutes: null, isCancelled: false, isConfirmed: false },
        ],
      },
      route: {
        scheduleId: '2026',
        orderId: '8',
        trainOrderId: null,
        carrierCode: 'KM',
        commercialCategorySymbol: 'R1',
        name: null,
        nationalNumber: '91342',
        stations: [
          { stationId: 'A', arrivalPlatform: null, arrivalTrack: null, departurePlatform: '1', departureTrack: '4', arrivalTime: null, departureTime: '19:54:00', arrivalDay: null, departureDay: null },
        ],
      },
      stationNames: { A: 'Grodzisk Mazowiecki' },
    })
    const { GET } = await import('./route')

    const response = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=8&operatingDate=2026-08-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.stops[0].isConfirmed).toBe(false)
    expect(body.stops[0].departureDelayMinutes).toBeNull()
    expect(body.stops[0].arrivalDelayMinutes).toBeNull()
  })

  it('caches a successful response for the same train key, without a second upstream call', async () => {
    getTrainDetail.mockClear()
    stubDetail()
    const { GET } = await import('./route')

    const first = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=6&operatingDate=2026-08-01'))
    const second = await GET(new Request('http://localhost/api/train?scheduleId=2026&orderId=6&operatingDate=2026-08-01'))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(getTrainDetail).toHaveBeenCalledTimes(1)
  })
})
