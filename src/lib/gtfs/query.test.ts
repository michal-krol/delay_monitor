import { describe, expect, it } from 'vitest'
import { buildSchedule, type BuildScheduleInput } from './schedule'
import { contrastText, modeFromRouteType } from './schema'
import { dayTimetable, linesByMode, nextDepartures, searchStops, stopGroup } from './query'
import type { GtfsRoute } from './types'

const TZ = 'Europe/Warsaw'
const DATES: [string, string, string] = ['2026-09-01', '2026-09-02', '2026-09-03']

function route(id: string, type: number, shortName = id): GtfsRoute {
  return { id, shortName, longName: shortName, mode: modeFromRouteType(type), color: null, textColor: contrastText(null) }
}
function stop(id: string, name: string, parentId: string | null = null) {
  return { id, name, lat: 52, lon: 21, locationType: '0', parentId, platformCode: null, wheelchair: 0 as const }
}

function make(over: Partial<BuildScheduleInput>) {
  return buildSchedule({
    feedVersion: 'v1',
    serviceDates: DATES,
    timezone: TZ,
    attribution: [],
    routes: over.routes ?? [route('1', 3)],
    stops: over.stops ?? [stop('1001', 'Rondo')],
    trips: over.trips ?? [],
    frequencies: over.frequencies ?? [],
    calendars: [],
    calendarDates: over.calendarDates ?? [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: over.stopTimeLines ?? [],
  })
}

/** ms w chwili `hh:mm` czasu warszawskiego dnia 2026-09-02 (CEST → −2h do UTC). */
const waw0902 = (hh: number, mm = 0) => Date.parse(`2026-09-02T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`)

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

describe('stopGroup', () => {
  it('returns members and the modes serving the group', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1'), route('20', 0, '20')],
      stops: [stop('7014M:P1', 'Świętokrzyska', '7014M'), stop('7014M:P2', 'Świętokrzyska', '7014M'), stop('7014M', 'Świętokrzyska')],
      trips: [
        { routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: 'K', directionId: 0 },
        { routeId: '20', serviceId: 'S', tripId: 't', headsign: 'P', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'm,7014M:P1,12:00:00,12:00:00,1',
        't,7014M:P2,12:02:00,12:02:00,1',
      ],
    })
    const group = stopGroup(schedule, '7014M')
    expect(group?.members).toHaveLength(3)
    expect(new Set(group?.modes)).toEqual(new Set(['metro', 'tram']))
  })

  it('returns null for an unknown id', async () => {
    expect(stopGroup(await make({}), 'nope')).toBeNull()
  })
})

describe('linesByMode', () => {
  it('groups routes by mode and sorts line numbers naturally', async () => {
    const schedule = await make({
      routes: [route('10', 0, '10'), route('2', 0, '2'), route('523', 3, '523'), route('M1', 1, 'M1')],
    })
    const grouped = linesByMode(schedule)
    expect(grouped.tram.map((r) => r.shortName)).toEqual(['2', '10'])
    expect(grouped.bus.map((r) => r.shortName)).toEqual(['523'])
    expect(grouped.metro.map((r) => r.shortName)).toEqual(['M1'])
  })
})

describe('dayTimetable', () => {
  it('returns every departure of a (stop, route) for the service day, time-sorted', async () => {
    const schedule = await make({
      trips: [
        { routeId: '1', serviceId: 'S', tripId: 'x', headsign: 'A', directionId: 0 },
        { routeId: '1', serviceId: 'S', tripId: 'y', headsign: 'A', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'x,1001,22:00:00,22:00:00,1',
        'y,1001,06:00:00,06:00:00,1',
      ],
    })
    const entries = dayTimetable(schedule, '1001', '1', 1)
    expect(entries.map((e) => e.departureSec)).toEqual([6 * 3600, 22 * 3600])
    expect(dayTimetable(schedule, '1001', '1', 0)).toEqual([])
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

  it('dayTimetable returns [] for an unknown route or stop', async () => {
    const schedule = await make({})
    expect(dayTimetable(schedule, '1001', 'ghost', 1)).toEqual([])
    expect(dayTimetable(schedule, 'ghost', '1', 1)).toEqual([])
  })

  it('searchStops returns [] for a blank query', async () => {
    expect(searchStops(await make({}), '   ', 5)).toEqual([])
  })

  it('searchStops honours the limit even with many matches', async () => {
    const stops = Array.from({ length: 30 }, (_, i) => stop(`90${i.toString().padStart(2, '0')}`, `Aleja ${i}`))
    const schedule = await make({ stops })
    expect(searchStops(schedule, 'aleja', 3)).toHaveLength(3)
  })

  it('nextDepartures caps how many stop runs it merges for a huge group', async () => {
    // 20 słupków w jednym zespole (prefiks 4-cyfrowy), każdy z odjazdem.
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

describe('searchStops', () => {
  it('finds groups by diacritics-insensitive name, prefers prefix matches', async () => {
    const schedule = await make({
      stops: [stop('1001', 'Świętokrzyska'), stop('2002', 'Rondo ONZ - Świętokrzyska'), stop('3003', 'Dworzec')],
    })
    const results = searchStops(schedule, 'swietokrzyska', 5)
    expect(results[0].name).toBe('Świętokrzyska')
    expect(results.map((r) => r.name)).toContain('Rondo ONZ - Świętokrzyska')
    expect(searchStops(schedule, 'dworz', 5).map((r) => r.id)).toEqual(['3003'])
  })
})
