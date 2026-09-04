import { describe, expect, it } from 'vitest'
import { buildSchedule, type BuildScheduleInput } from './schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from './schema'
import {
  allLines,
  cityStats,
  groupLines,
  lineDetail,
  linesByMode,
  nextDepartures,
  searchStops,
  stopGroup,
  stopSummary,
} from './query'
import type { GtfsRoute } from './types'

const TZ = 'Europe/Warsaw'
const DATES: [string, string, string] = ['2026-09-01', '2026-09-02', '2026-09-03']

function route(id: string, type: number, shortName = id): GtfsRoute {
  return { id, shortName, longName: shortName, mode: modeFromRouteType(type), kind: lineKindFrom(shortName, undefined), color: null, textColor: contrastText(null) }
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
    // Linie z `groupRoutes` — posortowane, metro przed tramwajem w `modes`.
    expect(group?.lines.map((line) => line.line)).toEqual(['20', 'M1'])
    expect(group?.modes).toEqual(['metro', 'tram'])
    expect(group?.wheelchairNote).toBeNull() // słupki wheelchair=0 → brak sygnału
  })

  it('wheelchairNote: `2` na wszystkich słupkach = inaccessible, na części = partial, `1`/`0` = null', async () => {
    const withFlags = (a: 0 | 1 | 2, b: 0 | 1 | 2) =>
      make({
        stops: [
          { id: '100101', name: 'Centrum 01', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: a },
          { id: '100102', name: 'Centrum 02', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: b },
        ],
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: 'A', directionId: 0 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,100101,12:00:00,12:00:00,1'],
      })
    expect(stopGroup(await withFlags(2, 2), '1001')?.wheelchairNote).toBe('inaccessible')
    expect(stopGroup(await withFlags(2, 0), '1001')?.wheelchairNote).toBe('partial')
    expect(stopGroup(await withFlags(1, 1), '1001')?.wheelchairNote).toBeNull()
    // Sama nazwa zespołu bez numeru słupka.
    expect(stopGroup(await withFlags(1, 1), '1001')?.name).toBe('Centrum')
  })

  it('returns null for an unknown id', async () => {
    expect(stopGroup(await make({}), 'nope')).toBeNull()
  })

  it('given a bare słupek id returns the WHOLE group + requestedMemberId (deep-link z trasy linii)', async () => {
    const schedule = await make({
      stops: [
        { id: '100107', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 1, code: '07', street: 'Marszałkowska' },
        { id: '100106', name: 'Centrum', lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 1, code: '06', street: 'Al. Jerozolimskie' },
      ],
      trips: [
        { routeId: '4', serviceId: 'S', tripId: 'a', headsign: 'X', directionId: 0 },
        { routeId: '128', serviceId: 'S', tripId: 'b', headsign: 'Y', directionId: 0 },
      ],
      routes: [route('4', 0, '4'), route('128', 3, '128')],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'a,100107,12:00:00,12:00:00,1',
        'b,100106,12:05:00,12:05:00,1',
      ],
    })
    const group = stopGroup(schedule, '100107')
    expect(group?.id).toBe('1001')
    expect(group?.requestedMemberId).toBe('100107')
    expect(group?.members.map((m) => m.id)).toEqual(['100107', '100106'])
    expect(group?.members.find((m) => m.id === '100107')?.lines.map((l) => l.line)).toEqual(['4'])
    expect(group?.members.find((m) => m.id === '100106')?.lines.map((l) => l.line)).toEqual(['128'])
    // Pytanie o zespół → requestedMemberId null.
    expect(stopGroup(schedule, '1001')?.requestedMemberId).toBeNull()
  })
})

describe('groupLines / stopSummary', () => {
  const scheduleWithMetro = () =>
    make({
      routes: [route('M1', 1, 'M1')],
      stops: [stop('7014M', 'Świętokrzyska')],
      trips: [{ routeId: 'M1', serviceId: 'S', tripId: 'M1:KAB', headsign: 'Kabaty', directionId: 0 }],
      frequencies: [{ tripId: 'M1:KAB', startSec: 5 * 3600, endSec: 5 * 3600 + 20 * 60, headwaySecs: 600 }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'M1:KAB,7014M,05:00:00,05:00:00,1'],
    })

  it('groupLines returns the distinct lines of a group', async () => {
    const schedule = await scheduleWithMetro()
    expect(groupLines(schedule, '7014M')).toEqual([
      { routeId: 'M1', line: 'M1', color: null, mode: 'metro', kind: 'regular' },
    ])
    expect(groupLines(schedule, 'ghost')).toEqual([])
  })

  it('stopSummary counts today departures, first/last and the hourly histogram', async () => {
    const schedule = await scheduleWithMetro()
    const summary = stopSummary(schedule, '7014M', 1) // doba „dziś"
    expect(summary.lineCount).toBe(1)
    expect(summary.departuresToday).toBe(2) // frequencies 05:00, 05:10
    expect(summary.firstDepartureSec).toBe(5 * 3600)
    expect(summary.lastDepartureSec).toBe(5 * 3600 + 600)
    expect(summary.hourly[5]).toBe(2)
    expect(summary.hourly.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('stopSummary buckets an after-midnight departure into the wrapped hour', async () => {
    const schedule = await make({
      trips: [{ routeId: '1', serviceId: 'S', tripId: 'N', headsign: 'X', directionId: 0 }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'N,1001,25:30:00,25:30:00,1'],
    })
    const summary = stopSummary(schedule, '1001', 1)
    expect(summary.hourly[1]).toBe(1) // 25:30 → kubełek 1
  })
})

describe('cityStats', () => {
  it('counts lines per mode, bus kinds, trips today and the network hourly histogram', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1'), route('20', 0, '20'), route('128', 3, '128'), route('N16', 3, 'N16'), route('521', 3, '521')],
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
    expect(stats.linesByMode).toEqual({ metro: 1, tram: 1, bus: 3, rail: 0, other: 0 })
    expect(stats.busKinds).toEqual({ regular: 1, night: 1, express: 1, replacement: 0 })
    expect(stats.modeCount).toBe(3) // metro, tram, bus
    expect(stats.tripsToday).toBe(3)
    expect(stats.firstDepartureSec).toBe(6 * 3600)
    expect(stats.lastDepartureSec).toBe(24 * 3600 + 15 * 60)
    expect(stats.hourly[6]).toBe(1)
    expect(stats.hourly[0]).toBe(1) // 24:15 → kubełek 0
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

describe('allLines', () => {
  it('groups every line by mode, sorted naturally, with the directional long name', async () => {
    const schedule = await make({
      routes: [route('10', 3, '10'), route('2', 3, '2'), route('M1', 1, 'M1')],
    })
    const lines = allLines(schedule)
    expect(lines.bus.map((l) => l.line)).toEqual(['2', '10'])
    expect(lines.metro.map((l) => l.line)).toEqual(['M1'])
    expect(lines.bus[0]).toMatchObject({ routeId: '2', longName: '2', textColor: '#000000' })
    expect(lines.tram).toEqual([])
  })
})

describe('lineDetail', () => {
  it('returns null for an unknown route id', async () => {
    const schedule = await make({})
    expect(lineDetail(schedule, 'nope')).toBeNull()
  })

  it('builds the representative run for each direction from the schedule', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('100101', 'Centrum 01'), stop('700201', 'Rondo ONZ'), stop('500801', 'Dworzec')],
      trips: [
        { routeId: '20', serviceId: 'S', tripId: 't0', headsign: 'Piaski', directionId: 0 },
        { routeId: '20', serviceId: 'S', tripId: 't1', headsign: 'Międzylesie', directionId: 1 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        't0,100101,12:00:00,12:00:00,1',
        't0,700201,12:06:00,12:06:00,2',
        't0,500801,12:12:00,12:12:00,3',
        't1,500801,12:20:00,12:20:00,1',
        't1,100101,12:32:00,12:32:00,2',
      ],
    })
    const detail = lineDetail(schedule, '20')
    expect(detail).not.toBeNull()
    expect(detail!.mode).toBe('tram')
    expect(detail!.directions.map((d) => d.directionId)).toEqual([0, 1])
    expect(detail!.directions[0]).toMatchObject({ headsign: 'Piaski' })
    // nazwa zespołu oczyszczona z numeru słupka
    expect(detail!.directions[0].stops.map((s) => s.name)).toEqual(['Centrum', 'Rondo ONZ', 'Dworzec'])
    expect(detail!.directions[0].stops.map((s) => s.groupId)).toEqual(['1001', '7002', '5008'])
    expect(detail!.directions[1].stops.map((s) => s.name)).toEqual(['Dworzec', 'Centrum'])
    expect(detail!.directions[0].origin).toBe('Centrum')
    // odjazdy z krańcówki (100101), pogrupowane po kategorii dnia
    expect(detail!.directions[0].departures).toEqual([{ category: 'weekday', times: [12 * 3600], frequencyBased: false }])
  })

  it('groups terminus departures by day category (weekday / saturday)', async () => {
    const schedule = await make({
      routes: [route('20', 0, '20')],
      stops: [stop('1001', 'Rondo'), stop('2002', 'Meta')],
      calendarDates: [
        { serviceId: 'PcS', date: '20260902', added: true },
        { serviceId: 'SbS', date: '20260902', added: true },
      ],
      trips: [
        { routeId: '20', serviceId: 'PcS', tripId: 'wd-a', headsign: 'Meta', directionId: 0 },
        { routeId: '20', serviceId: 'PcS', tripId: 'wd-b', headsign: 'Meta', directionId: 0 },
        { routeId: '20', serviceId: 'SbS', tripId: 'sa-a', headsign: 'Meta', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'wd-a,1001,06:00:00,06:00:00,1',
        'wd-a,2002,06:10:00,06:10:00,2',
        'wd-b,1001,06:20:00,06:20:00,1',
        'wd-b,2002,06:30:00,06:30:00,2',
        'sa-a,1001,08:00:00,08:00:00,1',
        'sa-a,2002,08:10:00,08:10:00,2',
      ],
    })
    const blocks = lineDetail(schedule, '20')!.directions[0].departures
    expect(blocks).toEqual([
      { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200], frequencyBased: false },
      { category: 'saturday', times: [8 * 3600], frequencyBased: false },
    ])
  })

  it('keeps the longest run when trips of one direction differ (short-turns)', async () => {
    const schedule = await make({
      routes: [route('9', 3, '9')],
      stops: [stop('1001', 'A'), stop('2002', 'B'), stop('3003', 'C')],
      trips: [
        { routeId: '9', serviceId: 'S', tripId: 'short', headsign: 'B', directionId: 0 },
        { routeId: '9', serviceId: 'S', tripId: 'full', headsign: 'C', directionId: 0 },
      ],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'short,1001,10:00:00,10:00:00,1',
        'short,2002,10:05:00,10:05:00,2',
        'full,1001,11:00:00,11:00:00,1',
        'full,2002,11:05:00,11:05:00,2',
        'full,3003,11:10:00,11:10:00,3',
      ],
    })
    const detail = lineDetail(schedule, '9')!
    expect(detail.directions).toHaveLength(1)
    expect(detail.directions[0].stops.map((s) => s.groupId)).toEqual(['1001', '2002', '3003'])
  })

  it('covers frequency-based trips (metro pattern)', async () => {
    const schedule = await make({
      routes: [route('M1', 1, 'M1')],
      stops: [stop('7014M:P1', 'Świętokrzyska', '7014M'), stop('100201', 'Kabaty')],
      trips: [{ routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: 'Kabaty', directionId: 0 }],
      frequencies: [{ tripId: 'm', startSec: 5 * 3600, endSec: 5 * 3600 + 1440, headwaySecs: 480 }],
      stopTimeLines: [
        'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
        'm,7014M:P1,05:00:00,05:00:00,1',
        'm,100201,05:12:00,05:12:00,2',
      ],
    })
    const detail = lineDetail(schedule, 'M1')!
    expect(detail.directions[0].stops.map((s) => s.name)).toEqual(['Świętokrzyska', 'Kabaty'])
  })
})
