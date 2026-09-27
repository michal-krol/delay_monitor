import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import type { GtfsSchedule } from '@/lib/gtfs/types'
import type { VehiclePosition } from '@/lib/gtfs/vehicles'

let schedule: GtfsSchedule | null = null
let positions: VehiclePosition[] = []
let vehiclePollerReady = true

const ensureLoaded = vi.fn()
const getGtfsPoller = vi.fn((city: string) =>
  city === 'warszawa' ? { ensureLoaded, getSchedule: () => schedule } : null
)
const fakeVehiclePoller = {
  getPositions: () => positions,
  getView: () => ({
    state: 'ready',
    fetchedAt: '2026-09-04T10:00:00.000Z',
    ageMs: 5000,
    count: positions.length,
    droppedPositions: 0,
  }),
}
const peekVehiclePoller = vi.fn((city: string) =>
  city === 'warszawa' && vehiclePollerReady ? fakeVehiclePoller : null
)

vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (...args: [string]) => getGtfsPoller(...args),
  peekVehiclePoller: (...args: [string]) => peekVehiclePoller(...args),
}))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'mock-1',
    serviceDates: ['2026-09-03', '2026-09-04', '2026-09-05'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [
      { id: '20', shortName: '20', longName: '20', mode: 'tram', kind: 'regular', color: null, textColor: '#000000' },
    ],
    stops: [
      { id: 'A', name: 'A', lat: 52.2, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      { id: 'B', name: 'B', lat: 52.22, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
    ],
    trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'B', directionId: 0 }],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260904', added: true }],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      'T,A,06:00:00,06:00:00,1',
      'T,B,06:10:00,06:10:00,2',
    ],
  })
})

async function call(url: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(url))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/vehicles', () => {
  beforeAll(() => {
    positions = []
    vehiclePollerReady = true
  })

  it('rejects an unknown city with 400 and no echo of the value', async () => {
    const { response, body } = await call('http://localhost/api/gtfs/vehicles?city=zzz&route=20&direction=0')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('zzz')
  })

  it('rejects a malformed route with 400 and no echo', async () => {
    const { response, body } = await call(
      'http://localhost/api/gtfs/vehicles?city=warszawa&route=..%2Fx&direction=0'
    )
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('..')
  })

  it('rejects direction other than 0/1 with 400', async () => {
    const { response } = await call('http://localhost/api/gtfs/vehicles?city=warszawa&route=20&direction=2')
    expect(response.status).toBe(400)
  })

  it('returns [] with state loading when the vehicle poller is not ready', async () => {
    vehiclePollerReady = false
    const { response, body } = await call(
      'http://localhost/api/gtfs/vehicles?city=warszawa&route=20&direction=0'
    )
    vehiclePollerReady = true
    expect(response.status).toBe(200)
    expect(body.vehicles).toEqual([])
    expect(body.feed.state).toBe('loading')
  })

  it('returns [] (200, not 400) for a well-formed but unknown route', async () => {
    positions = [
      { id: 'V', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() },
    ]
    const { response, body } = await call(
      'http://localhost/api/gtfs/vehicles?city=warszawa&route=999&direction=0'
    )
    expect(response.status).toBe(200)
    expect(body.vehicles).toEqual([])
  })

  it('returns projected vehicles for the route+direction, no delay field', async () => {
    positions = [
      { id: 'V', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() },
    ]
    const { response, body } = await call(
      'http://localhost/api/gtfs/vehicles?city=warszawa&route=20&direction=0'
    )
    expect(response.status).toBe(200)
    expect(ensureLoaded).toHaveBeenCalled()
    expect(body.city).toBe('warszawa')
    expect(body.route).toBe('20')
    expect(body.direction).toBe(0)
    expect(body.vehicles).toHaveLength(1)
    expect(typeof body.vehicles[0].afterStopOrder).toBe('number')
    expect(body.vehicles[0].routeId).toBe('20')
    expect(body.feed.state).toBe('ready')
    expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt|predictedAt/)
  })

  it('filters out vehicles on the other direction', async () => {
    positions = [
      { id: 'V', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() },
    ]
    const { body } = await call('http://localhost/api/gtfs/vehicles?city=warszawa&route=20&direction=1')
    expect(body.vehicles).toEqual([])
  })
})
