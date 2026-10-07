import { describe, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/gtfs/schedule'
import { lineKindFrom, modeFromRouteType } from '@/lib/gtfs/schema'
import type { GtfsRoute } from '@/lib/gtfs/types'
import { resolveLineCard, resolveRailCard, resolveStopCard, shareTitle, type ShareLookups } from './card'

function route(id: string, type: number, shortName = id, longName = shortName): GtfsRoute {
  return { id, shortName, longName, mode: modeFromRouteType(type), kind: lineKindFrom(shortName, undefined) }
}
function stop(id: string, name: string) {
  return { id, name, lat: 52, lon: 21, locationType: '0', parentId: null, platformCode: null, wheelchair: 0 as const }
}

async function schedule() {
  return buildSchedule({
    feedVersion: 'v1',
    serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    timezone: 'Europe/Warsaw',
    attribution: [],
    routes: [route('175', 3, '175', 'Lotnisko — Żerań')],
    stops: [stop('100101', 'Centrum'), stop('ABC:P1', 'Metro Wilanowska')],
    trips: [{ routeId: '175', serviceId: 'S', tripId: 'a', headsign: 'A', directionId: 0 }],
    frequencies: [],
    calendars: [],
    calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'a,100101,12:10:00,12:10:00,1', 'a,ABC:P1,12:20:00,12:20:00,2'],
  })
}

async function lookups(loaded = true) {
  const built = await schedule()
  const railStationName = vi.fn(async (id: string) => (id === '273' ? 'Szczecin Główny' : null))
  const l: ShareLookups = { railStationName, schedule: (city) => (loaded && city === 'warszawa' ? built : null) }
  return { l, railStationName }
}

const HOSTILE = ['<b>x</b>', '../x', '1'.repeat(11), '273?name=EVIL', '', 'a'.repeat(5000), '%00']

describe('rail card', () => {
  it('known id gives place card with name from lookup', async () => {
    const { l } = await lookups()
    expect(await resolveRailCard('273', l)).toEqual({ kind: 'place', label: 'Stacja kolejowa', title: 'Szczecin Główny', detail: null, mode: 'rail', city: null })
  })
  it('unknown id gives generic card', async () => {
    const { l } = await lookups()
    expect(await resolveRailCard('99999999', l)).toEqual({ kind: 'generic' })
  })
  it.each(HOSTILE)('hostile id %j gives generic card without a lookup', async (id) => {
    const { l, railStationName } = await lookups()
    expect(await resolveRailCard(id, l)).toEqual({ kind: 'generic' })
    expect(railStationName).not.toHaveBeenCalled()
  })
  it('a throwing lookup gives generic card', async () => {
    const { l } = await lookups()
    const broken: ShareLookups = { ...l, railStationName: async () => { throw new Error('boom') } }
    expect(await resolveRailCard('273', broken)).toEqual({ kind: 'generic' })
  })
  it('title is clamped to 60 chars with an ellipsis', async () => {
    const { l } = await lookups()
    const long: ShareLookups = { ...l, railStationName: async () => 'X'.repeat(300) }
    const card = await resolveRailCard('273', long)
    expect(card.kind === 'place' && card.title).toBe(`${'X'.repeat(59)}…`)
  })
})

describe('stop card', () => {
  it('known group gives place card with group name and city name', async () => {
    const { l } = await lookups()
    expect(await resolveStopCard('warszawa', '1001', l)).toMatchObject({ kind: 'place', label: 'Przystanek', title: 'Centrum', mode: 'bus', city: 'Warszawa' })
  })
  it('encoded platform id resolves via decodeStopIdFromPathSegment', async () => {
    const { l } = await lookups()
    expect(await resolveStopCard('warszawa', 'ABC-P1', l)).toMatchObject({ kind: 'place', title: 'Metro Wilanowska' })
  })
  it('unknown or invalid id gives generic card', async () => {
    const { l } = await lookups()
    for (const id of ['ZZZZ', ...HOSTILE]) expect(await resolveStopCard('warszawa', id, l)).toEqual({ kind: 'generic' })
  })
  it('unknown city or schedule not loaded gives generic card', async () => {
    const { l } = await lookups()
    expect(await resolveStopCard('krakow', '1001', l)).toEqual({ kind: 'generic' })
    expect(await resolveStopCard('Warszawa', '1001', l)).toEqual({ kind: 'generic' })
    const cold = await lookups(false)
    expect(await resolveStopCard('warszawa', '1001', cold.l)).toEqual({ kind: 'generic' })
  })
})

describe('line card', () => {
  it('known route gives place card with line label, long name and mode', async () => {
    const { l } = await lookups()
    expect(await resolveLineCard('warszawa', '175', l)).toEqual({ kind: 'place', label: 'Linia', title: '175', detail: 'Lotnisko — Żerań', mode: 'bus', city: 'Warszawa' })
  })
  it('unknown route, invalid route id or invalid city give generic card', async () => {
    const { l } = await lookups()
    expect(await resolveLineCard('warszawa', '999', l)).toEqual({ kind: 'generic' })
    for (const id of HOSTILE) expect(await resolveLineCard('warszawa', id, l)).toEqual({ kind: 'generic' })
    expect(await resolveLineCard('nope', '175', l)).toEqual({ kind: 'generic' })
  })
})

describe('shareTitle', () => {
  it('place → "<title> — Monitor opóźnień"; generic → null', async () => {
    const { l } = await lookups()
    expect(shareTitle(await resolveRailCard('273', l))).toBe('Szczecin Główny — Monitor opóźnień')
    expect(shareTitle({ kind: 'generic' })).toBeNull()
  })
})
