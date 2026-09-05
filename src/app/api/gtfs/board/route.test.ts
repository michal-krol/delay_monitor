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
  city === 'warszawa' ? { ensureLoaded, getSchedule: () => schedule, getView } : null
)

/** Podmieniany per-test: `null` = brak feedu pozycji, obiekt = udawany poller. */
let vehiclePoller: {
  getView: () => { state: string }
  getPositions: () => { tripId: string; lat: number; lon: number; sideNumber: string; bearing: number | null; timestamp: string; id: string }[]
} | null = null

/** Podmieniany per-test: `null` = brak feedu alertów, obiekt = udawany poller. */
let alertPoller: { getAlerts: () => { id: string; routes: string[]; effect: string; link: string; title: string; body: string }[] } | null = null

vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (...args: [string]) => getGtfsPoller(...args),
  peekVehiclePoller: () => vehiclePoller,
  peekAlertPoller: () => alertPoller,
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
      { id: '20', shortName: '20', longName: '20', mode: modeFromRouteType(0), kind: 'regular', color: null, textColor: contrastText(null) },
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
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      't,100101,12:00:00,12:00:00,1',
      't,100102,12:05:00,12:05:00,2',
    ],
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
    const { response, body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=..%2Fetc')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('etc')
  })

  it('returns a null entry for a well-formed but unknown stop id (not 400)', async () => {
    const { response, body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=999999')
    expect(response.status).toBe(200)
    expect(body.stops).toEqual([null])
  })

  it('returns grouped departures, attribution, and a schedule block; never a delay field', async () => {
    const { body } = await call(`http://localhost/api/gtfs/board?city=warszawa&stops=1001`)
    expect(ensureLoaded).toHaveBeenCalled()
    expect(body.stops[0].name).toBe('Centrum')
    expect(body.stops[0].departures.length).toBeGreaterThan(0)
    expect(body.attribution).toEqual(['ZTM', 'Mikołaj Kuranowski'])
    expect(body.schedule.state).toBe('ready')
    expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt|predictedAt/)
  })

  it('exposes group members (code/street/lines) and wheelchairNote', async () => {
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001')
    expect(body.stops[0].members).toHaveLength(2)
    expect(body.stops[0].members.map((m: { id: string }) => m.id)).toEqual(['100101', '100102'])
    expect(body.stops[0].wheelchairNote).toBeNull() // słupki wheelchair=1 → brak sygnału
    expect(body.stops[0].activeSlupek).toBeNull()
  })

  it('?slupek= scopes departures to one member of the group', async () => {
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001&slupek=100101')
    expect(body.stops[0].activeSlupek).toBe('100101')
    expect(body.stops[0].departures.every((d: { stopId: string }) => d.stopId === '100101')).toBe(true)
  })

  it('ignores a ?slupek= that is not in the group (falls back to whole group)', async () => {
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001&slupek=100109')
    expect(body.stops[0].activeSlupek).toBeNull()
  })

  it('departure.vehicle is null when no vehicle poller is ready', async () => {
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001&slupek=100101')
    expect(body.stops[0].departures[0].vehicle).toBeNull()
  })

  it('tags a departure with its vehicle distance in stops (ready poller + matching position)', async () => {
    vehiclePoller = {
      getView: () => ({ state: 'ready' }),
      getPositions: () => [
        { id: 'v', tripId: 't', lat: 52, lon: 21, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() },
      ],
    }
    try {
      const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001&slupek=100102')
      expect(typeof body.stops[0].departures[0].vehicle.stopsAway).toBe('number')
      expect(body.stops[0].departures[0].vehicle.stopsAway).toBe(0) // pojazd na odcinku tuż przed 100102
      expect(JSON.stringify(body)).not.toMatch(/delayMinutes|actualAt|predictedAt/)
    } finally {
      vehiclePoller = null
    }
  })

  it('returns state=loading with empty stops while the schedule is not ready', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001')
    expect(body.schedule.state).toBe('loading')
    expect(body.schedule.phase).toBe('stop_times')
    expect(body.stops).toEqual([])
    schedule = kept
  })

  it('stop.alerts is [] when no alert poller exists yet', async () => {
    const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001')
    expect(body.stops[0].alerts).toEqual([])
  })

  it('stop.alerts matches by the group\'s lines (route short name "20" from the fixture)', async () => {
    alertPoller = {
      getAlerts: () => [
        { id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii 20', body: 'b' },
        { id: 'b', routes: ['999'], effect: 'DETOUR', link: '', title: 'Inna linia', body: 'b' },
      ],
    }
    try {
      const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001')
      expect(body.stops[0].alerts).toEqual([{ id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii 20', body: 'b' }])
    } finally {
      alertPoller = null
    }
  })

  it('stop.alerts still matches when scoped to one słupek (?slupek=), not keyed by member id', async () => {
    // Regresja: `schedule.groupRoutes` jest kluczowany wyłącznie id zespołu
    // (`1001`), nigdy słupka (`100101`) — dopasowanie alertów musi zawsze iść
    // po zespole, inaczej `?slupek=` cichnie baner (patrz komentarz przy
    // `groupRouteIdxs` w route.ts).
    alertPoller = {
      getAlerts: () => [{ id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii 20', body: 'b' }],
    }
    try {
      const { body } = await call('http://localhost/api/gtfs/board?city=warszawa&stops=1001&slupek=100101')
      expect(body.stops[0].activeSlupek).toBe('100101')
      expect(body.stops[0].alerts).toEqual([{ id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii 20', body: 'b' }])
    } finally {
      alertPoller = null
    }
  })
})
