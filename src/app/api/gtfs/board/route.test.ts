import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { contrastText, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'
import { serviceDateWindow } from '@/lib/pkp/time'

const [YESTERDAY, TODAY, TOMORROW] = serviceDateWindow(new Date(), 'Europe/Warsaw')

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({
  state: schedule === null ? 'loading' : 'ready',
  loadedAt: schedule === null ? null : '2026-09-02T09:00:00.000Z',
  ageMs: schedule === null ? null : 1000,
  phase: schedule === null ? 'stop_times' : null,
  serviceDates: schedule?.serviceDates ?? null,
  feedVersion: schedule?.feedVersion ?? null,
}))
const ensureLoaded = vi.fn()

const getGtfsPoller = vi.fn((city: string) =>
  city === 'waw' ? { ensureLoaded, getSchedule: () => schedule, getView } : null
)

vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (...args: [string]) => getGtfsPoller(...args),
}))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'mock-1',
    serviceDates: [
      serviceDateWindow(new Date(), 'Europe/Warsaw')[0],
      TODAY,
      serviceDateWindow(new Date(), 'Europe/Warsaw')[2],
    ],
    timezone: 'Europe/Warsaw',
    attribution: ['ZTM', 'Mikołaj Kuranowski'],
    routes: [
      { id: '20', shortName: '20', longName: '20', mode: modeFromRouteType(0), color: null, textColor: contrastText(null) },
    ],
    stops: [
      { id: '100101', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1 },
      { id: '100102', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '02', wheelchair: 1 },
    ],
    trips: [{ routeId: '20', serviceId: 'S', tripId: 't', headsign: 'Piaski', directionId: 0 }],
    frequencies: [],
    calendars: [],
    // Aktywny wczoraj/dziś/jutro — dzięki „jutro" zawsze jest odjazd w przyszłości,
    // niezależnie od godziny uruchomienia testu.
    calendarDates: [YESTERDAY, TODAY, TOMORROW].map((date) => ({
      serviceId: 'S',
      date: date.replace(/-/g, ''),
      added: true,
    })),
    stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,100101,12:00:00,12:00:00,1'],
  })
})

async function call(url: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(url))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/board', () => {
  it('rejects an unknown city with 400 and no echo of the value', async () => {
    const { response, body } = await call('http://localhost/api/gtfs/board?city=zzz&stops=100101')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('zzz')
  })

  it('rejects a malformed stop id with 400 and no echo', async () => {
    const { response, body } = await call('http://localhost/api/gtfs/board?city=waw&stops=..%2Fetc')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('etc')
  })

  it('returns a null entry for a well-formed but unknown stop id (not 400)', async () => {
    const { response, body } = await call('http://localhost/api/gtfs/board?city=waw&stops=999999')
    expect(response.status).toBe(200)
    expect(body.stops).toEqual([null])
  })

  it('returns grouped departures, attribution, and a schedule block; never a delay field', async () => {
    const { body } = await call(`http://localhost/api/gtfs/board?city=waw&stops=1001`)
    expect(ensureLoaded).toHaveBeenCalled()
    expect(body.stops[0].name).toBe('Centrum')
    expect(body.stops[0].departures.length).toBeGreaterThan(0)
    expect(body.attribution).toEqual(['ZTM', 'Mikołaj Kuranowski'])
    expect(body.schedule.state).toBe('ready')
    expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt|predictedAt/)
  })

  it('returns state=loading with empty stops while the schedule is not ready', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('http://localhost/api/gtfs/board?city=waw&stops=1001')
    expect(body.schedule.state).toBe('loading')
    expect(body.schedule.phase).toBe('stop_times')
    expect(body.stops).toEqual([])
    schedule = kept
  })
})
