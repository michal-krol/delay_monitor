import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'

let schedule: GtfsSchedule | null = null
vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (city: string) => (city === 'warszawa' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule } : null),
}))

const route = (id: string, type: number) => ({ id, shortName: id, longName: '', mode: modeFromRouteType(type), kind: lineKindFrom(id, undefined) })
const stop = (id: string, lat: number) => ({ id, name: id, lat, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 as const })

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [route('M1', 1), route('128', 3)],
    stops: [stop('A', 52.1), stop('B', 52.2)],
    trips: [
      { routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: 'B', directionId: 0 },
      { routeId: '128', serviceId: 'S', tripId: 'b', headsign: 'B', directionId: 0 },
    ],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      'm,A,12:00:00,12:00:00,1',
      'm,B,12:05:00,12:05:00,2',
      'b,A,12:00:00,12:00:00,1',
      'b,B,12:09:00,12:09:00,2',
    ],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/backbone?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/backbone', () => {
  it('rejects bad or unknown cities', async () => {
    expect((await call('city=..')).response.status).toBe(400)
    expect((await call('city=zzz')).response.status).toBe(400)
  })

  it('returns metro/rail lines only, falling back to the stop polyline without a shape', async () => {
    const { response, body } = await call('city=warszawa')
    expect(body.lines).toEqual([{ routeId: 'M1', line: 'M1', mode: 'metro', points: [[52.1, 21], [52.2, 21]] }])
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  it('returns lines=null while the schedule loads', async () => {
    const saved = schedule
    schedule = null
    const { body } = await call('city=warszawa')
    schedule = saved
    expect(body.lines).toBeNull()
  })
})
