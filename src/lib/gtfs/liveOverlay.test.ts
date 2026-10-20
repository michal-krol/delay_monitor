import { describe, expect, it } from 'vitest'
import { alertsForRoutes, vehicleForStop, vehiclesInService } from './liveOverlay'
import type { AlertRecord } from './alerts'
import { route, stop, make } from './queryTestHelpers'

describe('vehiclesInService', () => {
  it('counts vehicles in service per mode, tallies unmatched', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20'), route('128', 3, '128')],
      trips: [
        { routeId: '20', serviceId: 'S', tripId: 'tram1', headsign: 'x', directionId: 0 },
        { routeId: '128', serviceId: 'S', tripId: 'bus1', headsign: 'y', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'tram1,1001,06:00:00,06:00:00,1',
        'bus1,1001,06:05:00,06:05:00,1',
      ],
    })
    const p = (tripId: string) => ({ id: tripId, tripId, lat: 52, lon: 21, sideNumber: '1', bearing: null, timestamp: '' })
    const r = vehiclesInService(schedule, [p('tram1'), p('bus1'), p('bus1'), p('ghost')])
    expect(r.counts.tram).toBe(1)
    expect(r.counts.bus).toBe(2)
    expect(r.unmatched).toBe(1)
  })
})

describe('vehicleForStop', () => {
  it('locates a vehicle N stops before the given stop, null once it has passed', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [
        { id: 'A', name: 'A', lat: 52.20, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'B', name: 'B', lat: 52.22, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'C', name: 'C', lat: 52.24, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'C', directionId: 0 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'T,A,06:00:00,06:00:00,1', 'T,B,06:05:00,06:05:00,2', 'T,C,06:10:00,06:10:00,3',
      ],
    })
    const idxC = schedule.stopIndexById.get('C')!
    const idxA = schedule.stopIndexById.get('A')!
    const near = { id: 'v', tripId: 'T', lat: 52.205, lon: 21, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() }
    expect(vehicleForStop(schedule, [near], 'T', idxC, Date.now())?.stopsAway).toBe(1) // between A and B, heading to C
    expect(vehicleForStop(schedule, [near], 'T', idxA, Date.now())).toBeNull() // already passed A
  })

  it('null when no position matches the trip', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('1001', 'A'), stop('2002', 'B')],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'B', directionId: 0 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'T,1001,06:00:00,06:00:00,1', 'T,2002,06:05:00,06:05:00,2',
      ],
    })
    expect(vehicleForStop(schedule, [], 'T', schedule.stopIndexById.get('2002')!, Date.now())).toBeNull()
  })

  async function abcSchedule() {
    return make({
      routes: [route('20', 0, '20')],
      stops: [
        { id: 'A', name: 'A', lat: 52.2, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'B', name: 'B', lat: 52.22, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
        { id: 'C', name: 'C', lat: 52.24, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 },
      ],
      trips: [{ routeId: '20', serviceId: 'S', tripId: 'T', headsign: 'C', directionId: 0 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'T,A,06:00:00,06:00:00,1', 'T,B,06:05:00,06:05:00,2', 'T,C,06:10:00,06:10:00,3',
      ],
    })
  }

  it('vehicleForStop result identical to linear scan', async () => {
    // Dwie pozycje tego samego `tripId` w jednej tablicy — indeks budowany dla
    // `vehicleForStop` musi zachować semantykę `Array.find` (pierwsze trafienie),
    // nie ostatnie ani przypadkowe.
    const schedule = await abcSchedule()
    const idxC = schedule.stopIndexById.get('C')!
    const firstNearAB = { id: 'v1', tripId: 'T', lat: 52.205, lon: 21, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() } // między A i B → stopsAway 1
    const secondNearBC = { id: 'v2', tripId: 'T', lat: 52.225, lon: 21, sideNumber: '2', bearing: null, timestamp: new Date().toISOString() } // między B i C → stopsAway 0
    const now = Date.now()
    expect(vehicleForStop(schedule, [firstNearAB, secondNearBC], 'T', idxC, now)?.stopsAway).toBe(1)
    // Kolejność odwrócona → nadal pierwsze trafienie w tablicy wygrywa.
    expect(vehicleForStop(schedule, [secondNearBC, firstNearAB], 'T', idxC, now)?.stopsAway).toBe(0)
  })

  it('new poll result (new array) is re-indexed', async () => {
    const schedule = await abcSchedule()
    const idxC = schedule.stopIndexById.get('C')!
    const stale = { id: 'v1', tripId: 'T', lat: 52.205, lon: 21, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() } // stopsAway 1
    const fresh = { id: 'v2', tripId: 'T', lat: 52.225, lon: 21, sideNumber: '2', bearing: null, timestamp: new Date().toISOString() } // stopsAway 0
    const now = Date.now()
    const firstPoll = [stale]
    expect(vehicleForStop(schedule, firstPoll, 'T', idxC, now)?.stopsAway).toBe(1)
    // Nowa tablica z nowego cyklu pollera — indeks starej tablicy nie może przeciekać.
    const secondPoll = [fresh]
    expect(vehicleForStop(schedule, secondPoll, 'T', idxC, now)?.stopsAway).toBe(0)
    // Stara tablica wciąż daje swój (skądinąd wciąż poprawny) wynik.
    expect(vehicleForStop(schedule, firstPoll, 'T', idxC, now)?.stopsAway).toBe(1)
  })
})


describe('alertsForRoutes', () => {
  const alert = (routes: string[]): AlertRecord => ({ id: `a-${routes.join('-')}`, routes, effect: 'DETOUR', link: '', title: 't', body: 'b' })
  const scheduleWith20 = () => make({ routes: [route('20', 0, '20'), route('M1', 1, 'M1')] })

  it('returns [] for an empty route set without touching the alert list', async () => {
    const s = await scheduleWith20()
    expect(alertsForRoutes(s, [alert(['20'])], new Set())).toEqual([])
  })

  it('returns [] when no alert matches the given routes', async () => {
    const s = await scheduleWith20()
    const routeIdx = s.routeIndexById.get('20')!
    expect(alertsForRoutes(s, [alert(['999'])], new Set([routeIdx]))).toEqual([])
  })

  it('matches an alert whose routes include the short name of a requested route', async () => {
    const s = await scheduleWith20()
    const routeIdx = s.routeIndexById.get('20')!
    const a = alert(['20'])
    expect(alertsForRoutes(s, [a], new Set([routeIdx]))).toEqual([a])
  })

  it('does not duplicate an alert matching more than one requested route', async () => {
    const s = await scheduleWith20()
    const idx20 = s.routeIndexById.get('20')!
    const a = alert(['20', 'M1'])
    // Zbiór zawierający tylko jedną z dwóch linii alertu wciąż daje jedno trafienie.
    expect(alertsForRoutes(s, [a], new Set([idx20]))).toEqual([a])
  })
})

