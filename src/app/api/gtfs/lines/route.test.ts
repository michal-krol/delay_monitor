import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({ state: schedule === null ? 'loading' : 'ready', loadedAt: null, ageMs: null, phase: 'tabele', serviceDates: null, feedVersion: null }))
const getGtfsPoller = vi.fn((city: string) =>
  city === 'waw' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule, getView } : null
)
vi.mock('@/lib/gtfs/instance', () => ({ getGtfsPoller: (...a: [string]) => getGtfsPoller(...a) }))

const route = (id: string, type: number) => ({
  id, shortName: id, longName: `${id} długa`, mode: modeFromRouteType(type),
  kind: lineKindFrom(id, undefined), color: null, textColor: contrastText(null),
})

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: ['ZTM'],
    routes: [route('10', 3), route('2', 3), route('M1', 1)],
    stops: [{ id: '1001', name: 'A', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 }],
    trips: [],
    frequencies: [],
    calendars: [],
    calendarDates: [],
    stopTimeLines: [],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/lines?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/lines', () => {
  it('rejects a malformed city with 400 and no echo', async () => {
    const { response, body } = await call('city=..%2Fx')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('..')
  })

  it('rejects an unknown city with 400', async () => {
    expect((await call('city=zzz')).response.status).toBe(400)
  })

  it('returns lines grouped by mode, naturally sorted', async () => {
    const { body } = await call('city=waw')
    expect(body.schedule.state).toBe('ready')
    expect(body.lines.bus.map((l: { line: string }) => l.line)).toEqual(['2', '10'])
    expect(body.lines.metro.map((l: { line: string }) => l.line)).toEqual(['M1'])
    expect(body.lines.bus[0].longName).toBe('2 długa')
    expect(body.attribution).toEqual(['ZTM'])
  })

  it('returns lines=null while the schedule loads', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('city=waw')
    expect(body.schedule.state).toBe('loading')
    expect(body.lines).toBeNull()
    schedule = kept
  })
})
