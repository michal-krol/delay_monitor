import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({ state: schedule === null ? 'loading' : 'ready', loadedAt: null, ageMs: null, phase: null, serviceDates: null, feedVersion: null }))
const getGtfsPoller = vi.fn((city: string) =>
  city === 'warszawa' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule, getView } : null
)
vi.mock('@/lib/gtfs/instance', () => ({ getGtfsPoller: (...a: [string]) => getGtfsPoller(...a) }))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [
      { id: '20', shortName: '20', longName: 'Piaski – Międzylesie', mode: modeFromRouteType(0), kind: lineKindFrom('20', undefined), color: null, textColor: contrastText(null) },
    ],
    stops: [
      { id: '100101', name: 'Centrum 01', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '01', wheelchair: 0 },
      { id: '700201', name: 'Rondo ONZ', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
    ],
    trips: [
      { routeId: '20', serviceId: 'S', tripId: 't0', headsign: 'Piaski', directionId: 0 },
      { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'Międzylesie', directionId: 1 },
    ],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      't0,100101,12:00:00,12:00:00,1',
      't0,700201,12:06:00,12:06:00,2',
      't1,700201,12:20:00,12:20:00,1',
      't1,100101,12:26:00,12:26:00,2',
    ],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/line?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/line', () => {
  it('rejects a malformed city with 400', async () => {
    expect((await call('city=..%2Fx&route=20')).response.status).toBe(400)
  })

  it('rejects an unknown city with 400', async () => {
    expect((await call('city=zzz&route=20')).response.status).toBe(400)
  })

  it('rejects a malformed route id with 400 and no echo', async () => {
    const { response, body } = await call('city=warszawa&route=..%2Fetc')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('etc')
  })

  it('returns line=null (200) for a well-formed unknown route id', async () => {
    const { response, body } = await call('city=warszawa&route=999')
    expect(response.status).toBe(200)
    expect(body.line).toBeNull()
  })

  it('returns the run for each direction, with cleaned group names', async () => {
    const { body } = await call('city=warszawa&route=20')
    expect(body.line.mode).toBe('tram')
    expect(body.line.directions.map((d: { directionId: number }) => d.directionId)).toEqual([0, 1])
    expect(body.line.directions[0].headsign).toBe('Piaski')
    expect(body.line.directions[0].stops.map((s: { name: string }) => s.name)).toEqual(['Centrum', 'Rondo ONZ'])
    expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt/)
  })

  it('returns line=null while the schedule loads', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('city=warszawa&route=20')
    expect(body.schedule.state).toBe('loading')
    expect(body.line).toBeNull()
    schedule = kept
  })
})
