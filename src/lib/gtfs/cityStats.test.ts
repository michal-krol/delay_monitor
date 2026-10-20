import { describe, expect, it } from 'vitest'
import { cityStats } from './cityStats'
import { route, stop, make } from './queryTestHelpers'

describe('cityStats', () => {
  it('counts lines per mode, bus kinds, trips today and the network hourly histogram', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1'), route('20', 0, '20'), route('128', 3, '128'), route('N16', 3, 'N16'), route('521', 3, '521'), route('727', 3, '727'), route('L-5', 3, 'L-5')],
      stops: [stop('1001', 'A')],
      trips: [
        { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'x', directionId: 0 },
        { routeId: '128', serviceId: 'S', tripId: 't2', headsign: 'x', directionId: 0 },
        { routeId: 'N16', serviceId: 'S', tripId: 't3', headsign: 'x', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't1,1001,06:00:00,06:00:00,1',
        't2,1001,07:30:00,07:30:00,1',
        't3,1001,24:15:00,24:15:00,1',
      ],
    })
    const stats = cityStats(schedule, 1)
    expect(stats.linesByMode).toEqual({ metro: 1, tram: 1, bus: 5, rail: 0, other: 0 })
    expect(stats.busKinds).toEqual({ regular: 1, night: 1, express: 1, replacement: 0, zone: 1, local: 1 })
    expect(stats.modeCount).toBe(3) // metro, tram, bus
    expect(stats.tripsToday).toBe(3)
    expect(stats.firstDepartureSec).toBe(6 * 3600)
    expect(stats.lastDepartureSec).toBe(24 * 3600 + 15 * 60)
    expect(stats.hourly[6]).toBe(1)
    expect(stats.hourly[0]).toBe(1) // 24:15 → kubełek 0
  })

  const statsFixture = () => ({
    routes: [route('M1', 1, 'M1'), route('20', 0, '20'), route('128', 3, '128')],
    stops: [stop('1001', 'A')],
    trips: [
      { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'x', directionId: 0 as const },
      { routeId: '128', serviceId: 'S', tripId: 't2', headsign: 'x', directionId: 0 as const },
    ],
    stopTimeLines: [
      'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
      't1,1001,06:00:00,06:00:00,1',
      't2,1001,07:30:00,07:30:00,1',
    ],
  })

  it('returns the same object for the same schedule and day', async () => {
    const schedule = await make(statsFixture())
    const first = cityStats(schedule, 1)
    const second = cityStats(schedule, 1)
    expect(second).toBe(first)
  })

  it('memoized cityStats equals a fresh computation', async () => {
    // Dwie instancje rozkładu z tych samych danych wejściowych — jedna karmi
    // pamięć podręczną, druga liczy „na surowo" (osobny klucz WeakMap).
    const cached = cityStats(await make(statsFixture()), 1)
    const fresh = cityStats(await make(statsFixture()), 1)
    expect(cached).toEqual(fresh)
  })

  it('different day index computes separately', async () => {
    const schedule = await make(statsFixture())
    const day1 = cityStats(schedule, 1)
    const day0 = cityStats(schedule, 0)
    expect(day0).not.toBe(day1)
    expect(day0.tripsToday).toBe(0) // oba kursy są w service day 1, nie 0
    expect(day1.tripsToday).toBe(2)
  })
})

