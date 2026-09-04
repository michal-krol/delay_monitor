import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsSchedule } from '@/lib/gtfs/types'
import type { VehiclePosition } from '@/lib/gtfs/vehicles'
import { serviceDateWindow } from '@/lib/pkp/time'

const [, TODAY] = serviceDateWindow(new Date(), 'Europe/Warsaw')

let schedule: GtfsSchedule | null = null
const getView = vi.fn(() => ({ state: schedule === null ? 'loading' : 'ready' }))
const getGtfsPoller = vi.fn((city: string) =>
  city === 'warszawa' ? { ensureLoaded: vi.fn(), getSchedule: () => schedule, getView } : null
)

type FakeVehiclePoller = { getView: () => { state: string; ageMs: number | null }; getPositions: () => VehiclePosition[] }
let vehiclePoller: FakeVehiclePoller | null = null
vi.mock('@/lib/gtfs/instance', () => ({
  getGtfsPoller: (...a: [string]) => getGtfsPoller(...a),
  peekVehiclePoller: () => vehiclePoller,
}))

const pos = (tripId: string): VehiclePosition => ({ id: tripId, tripId, lat: 52, lon: 21, sideNumber: '1', bearing: null, timestamp: '' })

beforeEach(() => {
  vehiclePoller = null
})

beforeAll(async () => {
  schedule = await buildSchedule({
    feedVersion: 'v1',
    serviceDates: [serviceDateWindow(new Date(), 'Europe/Warsaw')[0], TODAY, serviceDateWindow(new Date(), 'Europe/Warsaw')[2]],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [
      { id: '20', shortName: '20', longName: '20', mode: modeFromRouteType(0), kind: lineKindFrom('20', undefined), color: null, textColor: contrastText(null) },
    ],
    stops: [{ id: '100101', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: '01', wheelchair: 1 }],
    trips: [{ routeId: '20', serviceId: 'S', tripId: 't', headsign: 'Piaski', directionId: 0 }],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: TODAY.replace(/-/g, ''), added: true }],
    stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,100101,12:00:00,12:00:00,1'],
  })
})

async function call(qs: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/gtfs/city-stats?${qs}`))
  return { response, body: await response.json() }
}

describe('GET /api/gtfs/city-stats', () => {
  it('rejects an unknown city with 400 and no echo', async () => {
    const { response, body } = await call('city=zzz')
    expect(response.status).toBe(400)
    expect(JSON.stringify(body)).not.toContain('zzz')
  })

  it('returns ready stats built from the schedule', async () => {
    const { body } = await call('city=warszawa')
    expect(body.state).toBe('ready')
    expect(body.stats.tripsToday).toBe(1)
    expect(body.stats.linesByMode.tram).toBe(1)
    expect(body.stats.hourly).toHaveLength(24)
  })

  it('returns state=loading with null stats while the schedule is not ready', async () => {
    const kept = schedule
    schedule = null
    const { body } = await call('city=warszawa')
    expect(body.state).toBe('loading')
    expect(body.stats).toBeNull()
    schedule = kept
  })

  it('reports vehicle fields as null (never zeros) when no vehicle poller is present', async () => {
    const { body } = await call('city=warszawa')
    expect(body.vehiclesInService).toBeNull()
    expect(body.vehiclesUnmatched).toBeNull()
    expect(body.vehicleFeed).toEqual({ state: 'loading', ageMs: null })
  })

  it('reports vehicle fields as null when the vehicle poller is not ready', async () => {
    vehiclePoller = { getView: () => ({ state: 'failed', ageMs: 4000 }), getPositions: () => [pos('t')] }
    const { body } = await call('city=warszawa')
    expect(body.vehiclesInService).toBeNull()
    expect(body.vehiclesUnmatched).toBeNull()
    expect(body.vehicleFeed).toEqual({ state: 'failed', ageMs: 4000 })
  })

  it('counts vehicles in service per mode from a ready poller', async () => {
    vehiclePoller = {
      getView: () => ({ state: 'ready', ageMs: 1200 }),
      getPositions: () => [pos('t'), pos('t'), pos('ghost')],
    }
    const { body } = await call('city=warszawa')
    expect(body.vehiclesInService).toEqual({ metro: 0, tram: 2, bus: 0, rail: 0, other: 0 })
    expect(body.vehiclesUnmatched).toBe(1)
    expect(body.vehicleFeed).toEqual({ state: 'ready', ageMs: 1200 })
  })
})
