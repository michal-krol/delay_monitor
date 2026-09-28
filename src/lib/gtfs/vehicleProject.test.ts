import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSchedule } from './schedule'
import { projectVehicle } from './vehicleProject'

afterEach(() => vi.restoreAllMocks())

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps

describe('projectVehicle', () => {
  async function schedule() {
    return buildSchedule({
      feedVersion: null,
      serviceDates: ['2026-09-03', '2026-09-04', '2026-09-05'] as [string, string, string],
      timezone: 'Europe/Warsaw',
      attribution: [],
      routes: [{ id: '20', shortName: '20', longName: '20', mode: 'tram', kind: 'regular', color: null, textColor: '#000000' }],
      stops: [
        { id: 'A', name: 'A', lat: 52.2, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'B', name: 'B', lat: 52.22, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'B', directionId: 0 }],
      frequencies: [],
      calendars: [],
      calendarDates: [{ serviceId: 'S', date: '20260904', added: true }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'T,A,06:00:00,06:00:00,1',
        'T,B,06:10:00,06:10:00,2',
      ],
    })
  }

  it('projects a point mid-segment to afterStopOrder 0, fraction ~0.5', async () => {
    const s = await schedule()
    const p = { id: 'V/20/1', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    const r = projectVehicle(s, p, Date.now())!
    expect(r.afterStopOrder).toBe(0)
    expect(near(r.fraction, 0.5)).toBe(true)
    expect(r.routeId).toBe('20')
    expect(r.ageSec).toBeLessThan(5)
  })

  it('carries the raw vehicle lat/lon through from the position', async () => {
    const s = await schedule()
    const p = { id: 'V/20/1', tripId: 'T', lat: 52.2123, lon: 21.0045, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    const r = projectVehicle(s, p, Date.now())!
    expect(r.lat).toBe(52.2123)
    expect(r.lon).toBe(21.0045)
  })

  it('returns null for an unknown trip_id', async () => {
    const s = await schedule()
    expect(
      projectVehicle(s, { id: 'x', tripId: 'NOPE', lat: 52.21, lon: 21, sideNumber: '1', bearing: null, timestamp: '' }, Date.now())
    ).toBeNull()
  })

  it('returns null for a point far off the route', async () => {
    const s = await schedule()
    const p = { id: 'x', tripId: 'T', lat: 52.5, lon: 21.5, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    expect(projectVehicle(s, p, Date.now())).toBeNull()
  })

  it('returns null for a trip whose pattern has only one stop', async () => {
    const s = await buildSchedule({
      feedVersion: null,
      serviceDates: ['2026-09-03', '2026-09-04', '2026-09-05'] as [string, string, string],
      timezone: 'Europe/Warsaw',
      attribution: [],
      routes: [{ id: '20', shortName: '20', longName: '20', mode: 'tram', kind: 'regular', color: null, textColor: '#000000' }],
      stops: [{ id: 'A', name: 'A', lat: 52.2, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 }],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: null, directionId: 0 }],
      frequencies: [],
      calendars: [],
      calendarDates: [{ serviceId: 'S', date: '20260904', added: true }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'T,A,06:00:00,06:00:00,1'],
    })
    const p = { id: 'x', tripId: 'T', lat: 52.2, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    expect(projectVehicle(s, p, Date.now())).toBeNull()
  })

  it('projection computed once per position across calls with different nowMs, ageSec still reflects nowMs', async () => {
    // Geometria (szukanie najbliższego odcinka, `Math.hypot` w `projectOnSegment`)
    // to drogi krok — musi policzyć się raz na `(schedule, position)`, nie przy
    // każdym wywołaniu. `ageSec` natomiast MUSI odzwierciedlać bieżące `nowMs`.
    const s = await schedule()
    const timestamp = new Date(Date.now() - 10_000).toISOString()
    const p = { id: 'V/20/1', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp }
    const hypotSpy = vi.spyOn(Math, 'hypot')

    const now1 = Date.now()
    const r1 = projectVehicle(s, p, now1)!
    const callsAfterFirst = hypotSpy.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const now2 = now1 + 5_000
    const r2 = projectVehicle(s, p, now2)!
    expect(hypotSpy.mock.calls.length).toBe(callsAfterFirst) // brak dodatkowej geometrii — trafienie w pamięć podręczną

    expect(r2.afterStopOrder).toBe(r1.afterStopOrder)
    expect(r2.fraction).toBe(r1.fraction)
    expect(r2.ageSec).toBeGreaterThan(r1.ageSec) // policzone świeżo z `now2`
  })

  it('carries a null headsign when the trip has none', async () => {
    const s = await buildSchedule({
      feedVersion: null,
      serviceDates: ['2026-09-03', '2026-09-04', '2026-09-05'] as [string, string, string],
      timezone: 'Europe/Warsaw',
      attribution: [],
      routes: [{ id: '20', shortName: '20', longName: '20', mode: 'tram', kind: 'regular', color: null, textColor: '#000000' }],
      stops: [
        { id: 'A', name: 'A', lat: 52.2, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'B', name: 'B', lat: 52.22, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: null, directionId: 0 }],
      frequencies: [],
      calendars: [],
      calendarDates: [{ serviceId: 'S', date: '20260904', added: true }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'T,A,06:00:00,06:00:00,1',
        'T,B,06:10:00,06:10:00,2',
      ],
    })
    const p = { id: 'x', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    expect(projectVehicle(s, p, Date.now())!.headsign).toBeNull()
  })
})
