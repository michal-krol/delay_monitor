import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'

const searchStations = vi.fn(async () => [
  { id: '33605', name: 'Warszawa Centralna' },
  { id: '7500', name: 'Warszawa Zachodnia' },
  { id: '80416', name: 'Kraków Główny' },
])
vi.mock('@/lib/board/instance', () => ({
  client: { searchStations: () => searchStations() },
}))

let schedule: GtfsSchedule | null = null
vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (city: string) =>
    city === 'warszawa' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule } : null,
}))

beforeAll(async () => {
  const route = (id: string, type: number) => ({
    id,
    shortName: id,
    longName: id,
    mode: modeFromRouteType(type),
    kind: lineKindFrom(id, undefined),
  })
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [route('M1', 1), route('20', 0)],
    stops: [
      { id: '7014M', name: 'Świętokrzyska', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      { id: '700201', name: 'Rondo ONZ', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
    ],
    trips: [
      { routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: null, directionId: 0 },
      { routeId: '20', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 },
    ],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      'm,7014M,12:00:00,12:00:00,1',
      't,700201,12:05:00,12:05:00,1',
    ],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/search?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/search', () => {
  it('rejects an unknown city with 400, no echo of the value', async () => {
    const { response, body } = await call('city=zz&q=abc')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('zz')
  })

  it('returns [] below 3 characters', async () => {
    expect((await call('city=warszawa&q=ab')).body.stations).toEqual([])
  })

  it('merges rail stations (city-prefixed) and transit groups with line badges', async () => {
    const { body } = await call('city=warszawa&q=war')
    const rail = body.stations.filter((s: { kind: string }) => s.kind === 'rail')
    expect(rail.map((s: { name: string }) => s.name)).toEqual(['Warszawa Centralna', 'Warszawa Zachodnia'])
    // "Kraków Główny" nie ma prefiksu "Warszawa " — odsiane.
    expect(JSON.stringify(body)).not.toContain('Kraków')

    const { body: transit } = await call('city=warszawa&q=swi')
    const hit = transit.stations.find((s: { kind: string }) => s.kind === 'transit')
    expect(hit.name).toBe('Świętokrzyska')
    expect(hit.lines).toEqual([{ routeId: 'M1', line: 'M1', mode: 'metro', kind: 'regular' }])
  })

  it('searches rail stations country-wide with rail=all (the map)', async () => {
    const { body } = await call('city=warszawa&q=kra&rail=all')
    expect(body.stations.map((s: { name: string }) => s.name)).toContain('Kraków Główny')
  })

  it('carries map coordinates: rail from station-coordinates.json, transit as the group centroid', async () => {
    const { body } = await call('city=warszawa&q=war')
    const centralna = body.stations.find((s: { id: string }) => s.id === '33605')
    expect(centralna.lat).toBeCloseTo(52.2288, 3)
    expect(centralna.lon).toBeCloseTo(21.0033, 3)

    const { body: transit } = await call('city=warszawa&q=swi')
    expect(transit.stations[0]).toMatchObject({ lat: 52, lon: 21 })
  })

  it('flags loading while the schedule is not ready — rail still works, transit retries', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('city=warszawa&q=war')
    expect(body.stations.every((s: { kind: string }) => s.kind === 'rail')).toBe(true)
    expect(body.loading).toBe(true)
    schedule = kept
    expect((await call('city=warszawa&q=war')).body.loading).toBe(false)
  })
})
