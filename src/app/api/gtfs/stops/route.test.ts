import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import type { GtfsSchedule } from '@/lib/gtfs/types'

let schedule: GtfsSchedule | null = null
const ensureLoaded = vi.fn()
const getGtfsPoller = vi.fn((city: string) =>
  city === 'waw' ? { ensureLoaded, getSchedule: () => schedule, getView: () => ({}) } : null
)

vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (...args: [string]) => getGtfsPoller(...args),
}))

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [],
    stops: [
      { id: '100101', name: 'Świętokrzyska', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      { id: '200201', name: 'Dworzec Centralny', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
    ],
    trips: [],
    frequencies: [],
    calendars: [],
    calendarDates: [],
    stopTimeLines: [],
  })
})

async function call(url: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(url))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/stops', () => {
  it('rejects an unknown city with 400', async () => {
    const { response } = await call('http://localhost/api/gtfs/stops?city=zz&q=swi')
    expect(response.status).toBe(400)
  })

  it('returns [] for a blank or overlong query', async () => {
    expect((await call('http://localhost/api/gtfs/stops?city=waw&q=')).body.stations).toEqual([])
    const long = 'a'.repeat(200)
    expect((await call(`http://localhost/api/gtfs/stops?city=waw&q=${long}`)).body.stations).toEqual([])
  })

  it('searches stop groups diacritics-insensitively', async () => {
    const { body } = await call('http://localhost/api/gtfs/stops?city=waw&q=swietokrzyska')
    expect(body.stations.map((s: { name: string }) => s.name)).toEqual(['Świętokrzyska'])
  })

  it('returns [] (not an error) while the schedule is still loading', async () => {
    const kept = schedule
    schedule = null
    const { response, body } = await call('http://localhost/api/gtfs/stops?city=waw&q=dwor')
    expect(response.status).toBe(200)
    expect(body.stations).toEqual([])
    schedule = kept
  })
})
