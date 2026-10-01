import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({ state: schedule === null ? 'loading' : 'ready', loadedAt: null, ageMs: null, phase: 'tabele', serviceDates: null, feedVersion: null }))
const getGtfsPoller = vi.fn((city: string) =>
  city === 'warszawa' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule, getView } : null
)
vi.mock('@/lib/gtfs/instance', () => ({ getGtfsPoller: (...a: [string]) => getGtfsPoller(...a) }))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: ['ZTM'],
    routes: [{ id: '128', shortName: '128', longName: '', mode: modeFromRouteType(3), kind: lineKindFrom('128', undefined) }],
    stops: [{ id: '100101', name: 'Centrum', lat: 52.2301, lon: 21.0115, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 }],
    trips: [{ routeId: '128', serviceId: 'S', tripId: 'b', headsign: 'B', directionId: 0 }],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'b,100101,12:00:00,12:00:00,1'],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/stops?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/stops', () => {
  it('rejects a malformed or unknown city with 400 and no echo', async () => {
    const malformed = await call('city=..%2Fx')
    expect(malformed.response.status).toBe(400)
    expect(JSON.stringify(malformed.body)).not.toContain('..')
    expect((await call('city=zzz')).response.status).toBe(400)
  })

  it('returns stops with positions and a browser cache header', async () => {
    const { response, body } = await call('city=warszawa')
    expect(body.stops).toEqual([{ id: '100101', groupId: '1001', name: 'Centrum', code: null, lat: 52.2301, lon: 21.0115, mode: 'bus' }])
    expect(body.attribution).toEqual(['ZTM'])
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  it('returns stops=null without caching while the schedule loads', async () => {
    const saved = schedule
    schedule = null
    const { response, body } = await call('city=warszawa')
    schedule = saved
    expect(body.stops).toBeNull()
    expect(body.schedule.state).toBe('loading')
    expect(response.headers.get('Cache-Control')).toBeNull()
  })
})
