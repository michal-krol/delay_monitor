import { describe, expect, it } from 'vitest'
import { buildSchedule } from './schedule'
import { mapCityVehicles } from './cityVehicles'

describe('mapCityVehicles', () => {
  async function schedule() {
    return buildSchedule({
      feedVersion: null,
      serviceDates: ['2026-09-03', '2026-09-04', '2026-09-05'] as [string, string, string],
      timezone: 'Europe/Warsaw',
      attribution: [],
      routes: [
        { id: '20', shortName: '20', longName: '20', mode: 'tram', kind: 'regular', color: '#009944', textColor: '#ffffff' },
      ],
      stops: [
        { id: 'A', name: 'A', lat: 52.2, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'B', name: 'B', lat: 52.22, lon: 21.0, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'Centrum', directionId: 0 }],
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

  it('maps a known trip to its route, headsign and raw lat/lon', async () => {
    const s = await schedule()
    const p = { id: 'V/1', tripId: 'T', lat: 52.21, lon: 21.0044, sideNumber: '3801', bearing: -110, timestamp: new Date().toISOString() }
    const [v] = mapCityVehicles(s, [p], Date.now())
    expect(v.id).toBe('V/1')
    expect(v.lat).toBe(52.21)
    expect(v.lon).toBe(21.0044)
    expect(v.routeId).toBe('20')
    expect(v.shortName).toBe('20')
    expect(v.mode).toBe('tram')
    expect(v.color).toBe('#009944')
    expect(v.headsign).toBe('Centrum')
    expect(v.sideNumber).toBe('3801')
    expect(v.bearing).toBe(-110)
    expect(v.ageSec).toBeLessThan(5)
  })

  it('keeps a vehicle with an unknown trip_id in the list, without a route', async () => {
    const s = await schedule()
    const p = { id: 'V/2', tripId: 'NOPE', lat: 52.25, lon: 21.05, sideNumber: '9', bearing: null, timestamp: new Date().toISOString() }
    const [v] = mapCityVehicles(s, [p], Date.now())
    expect(v).toBeDefined()
    expect(v.lat).toBe(52.25)
    expect(v.routeId).toBeNull()
    expect(v.shortName).toBeNull()
    expect(v.mode).toBeNull()
    expect(v.color).toBeNull()
    expect(v.headsign).toBeNull()
  })

  it('falls back to ageSec 0 for an unparseable timestamp', async () => {
    const s = await schedule()
    const p = { id: 'V/3', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: 'not-a-date' }
    const [v] = mapCityVehicles(s, [p], Date.now())
    expect(v.ageSec).toBe(0)
  })

  it('maps every position, preserving order', async () => {
    const s = await schedule()
    const positions = [
      { id: 'V/1', tripId: 'T', lat: 52.21, lon: 21.0, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() },
      { id: 'V/2', tripId: 'NOPE', lat: 52.25, lon: 21.05, sideNumber: '2', bearing: null, timestamp: new Date().toISOString() },
    ]
    const result = mapCityVehicles(s, positions, Date.now())
    expect(result.map((v) => v.id)).toEqual(['V/1', 'V/2'])
  })
})
