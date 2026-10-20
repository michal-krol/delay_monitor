import { describe, expect, it } from 'vitest'
import { nextDepartures } from './departures'
import { route, stop, make, waw0902 } from './queryTestHelpers'

describe('nextDepartures', () => {
  it('merges every platform of a stop group into one time-ordered list', async () => {
    const schedule = await make({
      stops: [stop('100101', 'Centrum'), stop('100102', 'Centrum')],
      trips: [
        { routeId: '1', serviceId: 'S', tripId: 'a', headsign: 'A', directionId: 0 },
        { routeId: '1', serviceId: 'S', tripId: 'b', headsign: 'B', directionId: 1 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'a,100101,12:10:00,12:10:00,1',
        'b,100102,12:05:00,12:05:00,1',
      ],
    })
    const departures = nextDepartures(schedule, ['1001'], waw0902(12), 10)
    expect(departures.map((d) => d.headsign)).toEqual(['B', 'A'])
    expect(departures.map((d) => d.stopId)).toEqual(['100102', '100101'])
  })

  it('includes a departure exactly at now (>=), excludes the past, respects the limit', async () => {
    const schedule = await make({
      trips: [1, 2, 3, 4].map((k) => ({ routeId: '1', serviceId: 'S', tripId: `t${k}`, headsign: `H${k}`, directionId: 0 })),
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't1,1001,11:59:00,11:59:00,1', // przeszłość
        't2,1001,12:00:00,12:00:00,1', // dokładnie teraz
        't3,1001,12:01:00,12:01:00,1',
        't4,1001,12:02:00,12:02:00,1',
      ],
    })
    const departures = nextDepartures(schedule, ['1001'], waw0902(12), 2)
    expect(departures.map((d) => d.headsign)).toEqual(['H2', 'H3'])
  })

  it('marks frequency-based departures and never carries a delay field', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1')],
      stops: [stop('7014M', 'Świętokrzyska')],
      trips: [{ routeId: 'M1', serviceId: 'S', tripId: 'M1:KAB', headsign: 'Kabaty', directionId: 0 }],
      frequencies: [{ tripId: 'M1:KAB', startSec: 5 * 3600, endSec: 5 * 3600 + 20 * 60, headwaySecs: 600 }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'M1:KAB,7014M,05:00:00,05:00:00,1'],
    })
    const departures = nextDepartures(schedule, ['7014M'], waw0902(4), 5)
    expect(departures).toHaveLength(2)
    expect(departures.every((d) => d.frequencyBased)).toBe(true)
    expect(departures[0]).not.toHaveProperty('delayMinutes')
    expect(departures[0].plannedAt).toMatch(/\+0[12]:00$/)
  })
})


describe('edge cases', () => {
  it('nextDepartures on a bare stop id (not a group) still works', async () => {
    const schedule = await make({
      stops: [stop('900001', 'Samotny')],
      trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: 'A', directionId: 0 }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,900001,12:00:00,12:00:00,1'],
    })
    expect(nextDepartures(schedule, ['900001'], waw0902(11), 5)).toHaveLength(1)
    expect(nextDepartures(schedule, ['nieznany'], waw0902(11), 5)).toEqual([])
  })

  it('nextDepartures caps how many stop runs it merges for a huge group', async () => {
    // 20 przystanków w jednym zespole (prefiks 4-cyfrowy), każdy z odjazdem.
    const stops = Array.from({ length: 20 }, (_, i) => stop(`5500${i.toString().padStart(2, '0')}`.slice(0, 6), 'Węzeł'))
    const trips = stops.map((_, i) => ({ routeId: '1', serviceId: 'S', tripId: `t${i}`, headsign: 'H', directionId: 0 as const }))
    const lines = ['trip_id,stop_id,arrival_time,departure_time,stop_sequence']
    stops.forEach((s, i) => lines.push(`t${i},${s.id},12:${(10 + i).toString().padStart(2, '0')}:00,12:${(10 + i).toString().padStart(2, '0')}:00,1`))
    const schedule = await make({ stops, trips, stopTimeLines: lines })
    // Nie wywala się i zwraca posortowaną listę w granicach limitu.
    const out = nextDepartures(schedule, ['5500'], waw0902(11), 5)
    expect(out.length).toBeLessThanOrEqual(5)
    expect(out).toEqual([...out].sort((a, b) => a.departureSec - b.departureSec))
  })
})
