import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'
import { serviceDateWindow } from '@/lib/pkp/time'

const [YESTERDAY, TODAY, TOMORROW] = serviceDateWindow(new Date(), 'Europe/Warsaw')

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({ state: schedule === null ? 'loading' : 'ready', loadedAt: null, ageMs: null, phase: null, serviceDates: null, feedVersion: null }))
const getGtfsPoller = vi.fn((city: string) =>
  city === 'waw' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule, getView } : null
)
vi.mock('@/lib/gtfs/instance', () => ({ getGtfsPoller: (...a: [string]) => getGtfsPoller(...a) }))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: [YESTERDAY, TODAY, TOMORROW],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [
      { id: '20', shortName: '20', longName: '20', mode: modeFromRouteType(0), kind: lineKindFrom('20', undefined), color: null, textColor: contrastText(null) },
    ],
    stops: [{ id: '100101', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 }],
    trips: [
      { routeId: '20', serviceId: 'T', tripId: 'today1', headsign: 'Piaski', directionId: 0 },
      { routeId: '20', serviceId: 'Y', tripId: 'yest1', headsign: 'Piaski', directionId: 0 },
    ],
    frequencies: [],
    calendars: [],
    calendarDates: [
      { serviceId: 'T', date: TODAY.replace(/-/g, ''), added: true },
      { serviceId: 'Y', date: YESTERDAY.replace(/-/g, ''), added: true },
    ],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      'today1,100101,08:15:00,08:15:00,1',
      'today1,100101,14:40:00,14:40:00,1',
      'yest1,100101,09:00:00,09:00:00,1',
    ],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/timetable?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/timetable', () => {
  it('rejects a malformed stop id with 400 and no echo', async () => {
    const { response, body } = await call('city=waw&stop=..%2Fx&route=20')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('..')
  })

  it('rejects an unknown day value with 400', async () => {
    expect((await call('city=waw&stop=100101&route=20&day=someday')).response.status).toBe(400)
  })

  it('returns the full day board for a stop+route, time-ordered', async () => {
    const { body } = await call('city=waw&stop=100101&route=20')
    expect(body.serviceDate).toBe(TODAY)
    expect(body.entries.map((e: { departureSec: number }) => e.departureSec)).toEqual([8 * 3600 + 15 * 60, 14 * 3600 + 40 * 60])
    expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt/)
  })

  it('day=yesterday selects the previous service day', async () => {
    const { body } = await call('city=waw&stop=100101&route=20&day=yesterday')
    expect(body.serviceDate).toBe(YESTERDAY)
    expect(body.entries).toHaveLength(1)
  })

  it('returns empty entries while the schedule loads', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('city=waw&stop=100101&route=20')
    expect(body.entries).toEqual([])
    schedule = kept
  })
})
