import { describe, expect, it } from 'vitest'
import { cityStops, groupCentroid } from './cityMap'
import { route, stop, make } from './queryTestHelpers'

describe('cityStops', () => {
  const at = (id: string, name: string, lat: number, lon: number, parentId: string | null = null) => ({ ...stop(id, name, parentId), lat, lon })

  it('collapses metro platforms into the parent station, keeps bus posts, drops rail-only, idle and (0,0) stops', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1'), route('20', 0, '20'), route('128', 3, '128'), route('S1', 2, 'S1')],
      stops: [
        at('7014M', 'Świętokrzyska', 52.2353, 21.0089),
        at('7014M:P1', 'Świętokrzyska, peron M1', 52.23531, 21.00881, '7014M'),
        { ...at('100101', 'Centrum', 52.2301, 21.0115), code: '01' },
        at('100102', 'Centrum', 52.2302, 21.0116),
        at('500101', 'Stadion', 52.24, 21.04),
        at('600101', 'Nigdzie', 52.25, 21.05),
        at('700101', 'Bez pozycji', 0, 0),
      ],
      trips: [
        { routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: 'K', directionId: 0 },
        { routeId: '20', serviceId: 'S', tripId: 't', headsign: 'P', directionId: 0 },
        { routeId: '128', serviceId: 'S', tripId: 'b', headsign: 'B', directionId: 0 },
        { routeId: 'S1', serviceId: 'S', tripId: 'r', headsign: 'R', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'm,7014M:P1,12:00:00,12:00:00,1',
        't,100101,12:01:00,12:01:00,1',
        'b,100101,12:02:00,12:02:00,1',
        'b,100102,12:03:00,12:03:00,2',
        'r,500101,12:04:00,12:04:00,1',
        'b,700101,12:05:00,12:05:00,3',
      ],
    })
    const stops = cityStops(schedule)
    expect(stops).toEqual([
      { id: '7014M', groupId: '7014M', name: 'Świętokrzyska', code: null, lat: 52.2353, lon: 21.0089, mode: 'metro' },
      { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.2301, lon: 21.0115, mode: 'tram' },
      { id: '100102', groupId: '1001', name: 'Centrum', code: null, lat: 52.2302, lon: 21.0116, mode: 'bus' },
    ])
    expect(stops[0]).not.toHaveProperty('delayMinutes')
    expect(cityStops(schedule)).toBe(stops)
  })
})

describe('groupCentroid', () => {
  it('averages member positions, ignoring (0,0), and is null for an unknown group', async () => {
    const schedule = await make({
      stops: [
        { ...stop('100101', 'Centrum'), lat: 52.2, lon: 21.0 },
        { ...stop('100102', 'Centrum'), lat: 52.3, lon: 21.2 },
        { ...stop('100103', 'Centrum'), lat: 0, lon: 0 },
      ],
    })
    expect(groupCentroid(schedule, '1001')).toEqual({ lat: 52.25, lon: 21.1 })
    expect(groupCentroid(schedule, 'nope')).toBeNull()
  })
})
