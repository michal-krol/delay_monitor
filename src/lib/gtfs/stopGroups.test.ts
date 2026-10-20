import { describe, expect, it } from 'vitest'
import { groupLines, searchStops, stopGroup, stopSummary } from './stopGroups'
import { route, stop, make } from './queryTestHelpers'

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
    expect(group?.wheelchairNote).toBeNull() // przystanki wheelchair=0 → brak sygnału
  })

  it('wheelchairNote: `2` na wszystkich przystankach = inaccessible, na części = partial, `1`/`0` = null', async () => {
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
    // Sama nazwa zespołu bez numeru przystanku.
    expect(stopGroup(await withFlags(1, 1), '1001')?.name).toBe('Centrum')
  })

  it('returns null for an unknown id', async () => {
    expect(stopGroup(await make({}), 'nope')).toBeNull()
  })

  it('given a bare przystanek id returns the WHOLE group + requestedMemberId (deep-link z trasy linii)', async () => {
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
      { routeId: 'M1', line: 'M1', mode: 'metro', kind: 'regular' },
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

  it('searchStops results identical before/after memo (prefix-first ordering, Polish collation)', async () => {
    const schedule = await make({
      stops: [
        stop('1001', 'Żerań'), // trafienie od początku ('zeran')
        stop('2002', 'Żabieniec'), // trafienie od początku ('zabieniec' < 'zeran' w kolacji pl)
        stop('3003', 'Ratusz'), // 'z' w środku/na końcu — nie prefiks
        stop('4004', 'Dworzec'), // jw., przed 'Ratusz' w kolacji pl
        stop('5005', 'Wilanów'), // brak trafienia
      ],
    })
    // Pierwsze wywołanie buduje pamięć podręczną znormalizowanych nazw.
    const cold = searchStops(schedule, 'z', 10)
    // Drugie czyta z ciepłej pamięci — wynik musi być identyczny, łącznie z kolejnością.
    const warm = searchStops(schedule, 'z', 10)
    expect(warm).toEqual(cold)
    expect(cold.map((r) => r.name)).toEqual(['Żabieniec', 'Żerań', 'Dworzec', 'Ratusz'])
  })
})


describe('edge cases', () => {
  it('searchStops returns [] for a blank query', async () => {
    expect(searchStops(await make({}), '   ', 5)).toEqual([])
  })

  it('searchStops honours the limit even with many matches', async () => {
    const stops = Array.from({ length: 30 }, (_, i) => stop(`90${i.toString().padStart(2, '0')}`, `Aleja ${i}`))
    const schedule = await make({ stops })
    expect(searchStops(schedule, 'aleja', 3)).toHaveLength(3)
  })
})
