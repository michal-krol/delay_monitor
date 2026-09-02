import { describe, expect, it } from 'vitest'
import { isoInZone } from '@/lib/pkp/time'
import { buildSchedule, cleanGroupName, groupStopId, type BuildScheduleInput } from './schedule'
import { contrastText, lineKindFrom, modeFromRouteType } from './schema'
import type { GtfsRoute } from './types'

const at = (schedule: { evAbsSec: Float64Array; timezone: string }, eventIndex: number) =>
  isoInZone(schedule.evAbsSec[eventIndex] * 1000, schedule.timezone)

const TZ = 'Europe/Warsaw'
const DATES: [string, string, string] = ['2026-09-01', '2026-09-02', '2026-09-03']

function route(id: string, type: number, shortName = id): GtfsRoute {
  return {
    id,
    shortName,
    longName: shortName,
    mode: modeFromRouteType(type),
    kind: lineKindFrom(shortName, undefined),
    color: null,
    textColor: contrastText(null),
  }
}

function stop(id: string, name: string, parentId: string | null = null) {
  return { id, name, lat: 52, lon: 21, locationType: '0', parentId, platformCode: null, wheelchair: 0 as const }
}

type Overrides = Partial<BuildScheduleInput>

function makeInput(over: Overrides): BuildScheduleInput {
  return {
    feedVersion: over.feedVersion ?? 'v1',
    serviceDates: over.serviceDates ?? DATES,
    timezone: over.timezone ?? TZ,
    attribution: over.attribution ?? ['ZTM', 'Mikołaj Kuranowski'],
    routes: over.routes ?? [route('1', 3)],
    stops: over.stops ?? [stop('1001', 'Rondo'), stop('1002', 'Plac')],
    trips: over.trips ?? [],
    frequencies: over.frequencies ?? [],
    calendars: over.calendars ?? [],
    // Domyślnie kurs aktywny tylko w dobie „dziś" (indeks 1) — testy wielodobowe
    // podają własne `calendarDates`.
    calendarDates: over.calendarDates ?? [{ serviceId: 'S', date: '20260902', added: true }],
    stopTimeLines: over.stopTimeLines ?? [],
  }
}

describe('cleanGroupName', () => {
  it('drops a trailing 2-digit słupek number (ZTM convention)', () => {
    expect(cleanGroupName('Centrum 01')).toBe('Centrum')
    expect(cleanGroupName('Rondo ONZ 02')).toBe('Rondo ONZ')
  })
  it('leaves names without a trailing number alone', () => {
    expect(cleanGroupName('Świętokrzyska')).toBe('Świętokrzyska')
    expect(cleanGroupName('Dworzec Zachodni 100')).toBe('Dworzec Zachodni 100') // 3 cyfry ≠ słupek
  })
})

describe('groupStopId', () => {
  it('uses parent_station when present', () => {
    expect(groupStopId({ id: '7014M:P1', parentId: '7014M' })).toBe('7014M')
  })
  it('falls back to a 4-digit prefix of a 6-digit ZTM id', () => {
    expect(groupStopId({ id: '100101', parentId: null })).toBe('1001')
    expect(groupStopId({ id: '100102', parentId: null })).toBe('1001')
  })
  it('falls back to the id itself otherwise', () => {
    expect(groupStopId({ id: 'M1', parentId: null })).toBe('M1')
  })
})

describe('buildSchedule — grouping', () => {
  it('groups platforms into stop groups by parent and by ZTM prefix', async () => {
    const schedule = await buildSchedule(
      makeInput({
        stops: [
          stop('100101', 'Centrum 01'),
          stop('100102', 'Centrum 02'),
          stop('7014M:P1', 'Świętokrzyska', '7014M'),
          stop('7014M:P2', 'Świętokrzyska', '7014M'),
          stop('7014M', 'Świętokrzyska'),
        ],
      })
    )
    expect(schedule.groupMembers.get('1001')?.length).toBe(2)
    expect(schedule.groupMembers.get('7014M')?.length).toBe(3)
    expect(schedule.groupName.get('7014M')).toBe('Świętokrzyska')
  })

  it('collects the routes serving each group into groupRoutes', async () => {
    const schedule = await buildSchedule(
      makeInput({
        routes: [route('M1', 1, 'M1'), route('20', 0, '20')],
        stops: [stop('7014M:P1', 'Świętokrzyska', '7014M'), stop('7014M:P2', 'Świętokrzyska', '7014M')],
        trips: [
          { routeId: 'M1', serviceId: 'S', tripId: 'm', headsign: null, directionId: 0 },
          { routeId: '20', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 },
        ],
        stopTimeLines: [
          'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
          'm,7014M:P1,12:00:00,12:00:00,1',
          't,7014M:P2,12:02:00,12:02:00,1',
        ],
      })
    )
    const routeIndices = [...(schedule.groupRoutes.get('7014M') ?? [])].map((i) => schedule.routes[i].id).sort()
    expect(routeIndices).toEqual(['20', 'M1'])
  })
})

describe('buildSchedule — strefa czasowa (asercje na ISO z offsetem)', () => {
  it('places a 25:10 departure at 01:10 local on the NEXT calendar day', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: 'Plac', directionId: 0 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,1001,25:10:00,25:10:00,1'],
      })
    )
    // doba kursowania D = 2026-09-02 → D+1 01:10 lokalnego
    expect(at(schedule, 0)).toBe('2026-09-03T01:10:00+02:00')
  })

  it('honours the noon−12h rule on the autumn changeover (not midnight+offset)', async () => {
    const schedule = await buildSchedule(
      makeInput({
        serviceDates: ['2026-10-24', '2026-10-25', '2026-10-26'],
        calendarDates: [{ serviceId: 'S', date: '20261025', added: true }],
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,1001,03:30:00,03:30:00,1'],
      })
    )
    // Reguła „północ + offset" dałaby zły offset/godzinę; poprawnie 03:30 CET.
    expect(at(schedule, 0)).toBe('2026-10-25T03:30:00+01:00')
    expect(new Date(schedule.evAbsSec[0] * 1000).toISOString()).toBe('2026-10-25T02:30:00.000Z')
  })

  it('honours the noon−12h rule on the spring changeover', async () => {
    const schedule = await buildSchedule(
      makeInput({
        serviceDates: ['2026-03-28', '2026-03-29', '2026-03-30'],
        calendarDates: [{ serviceId: 'S', date: '20260329', added: true }],
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 't,1001,03:30:00,03:30:00,1'],
      })
    )
    expect(at(schedule, 0)).toBe('2026-03-29T03:30:00+02:00')
    expect(new Date(schedule.evAbsSec[0] * 1000).toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it("keeps yesterday's night-service departure visible after midnight", async () => {
    // Kurs doby WCZORAJSZEJ (2026-09-01), odjazd 24:20:00 = 00:20 dnia 2026-09-02.
    const schedule = await buildSchedule(
      makeInput({
        calendarDates: [{ serviceId: 'S', date: '20260901', added: true }],
        trips: [{ routeId: '1', serviceId: 'S', tripId: 'N1', headsign: 'Dworzec', directionId: 0 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'N1,1001,24:20:00,24:20:00,1'],
      })
    )
    expect(at(schedule, 0)).toBe('2026-09-02T00:20:00+02:00')
    expect(schedule.tripServiceDay[schedule.evTrip[0]]).toBe(0) // doba „wczoraj"
  })
})

describe('buildSchedule — nietypowa kolejność kolumn', () => {
  it('reads columns by header name when stop_sequence comes before arrival_time', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 }],
        stopTimeLines: [
          'trip_id,stop_sequence,stop_id,arrival_time,departure_time',
          't,1,1001,06:00:00,06:00:30',
          't,2,1002,06:05:00,06:05:00',
        ],
      })
    )
    expect(schedule.evCount).toBe(2)
    expect(schedule.evDepSec[0]).toBe(6 * 3600 + 30)
    expect(schedule.evSeq[1]).toBe(2)
  })
})

describe('buildSchedule — frequencies', () => {
  const metroInput = (freqRow: { startSec: number | null; endSec: number | null; headwaySecs: number }) =>
    makeInput({
      routes: [route('M1', 1, 'M1')],
      stops: [stop('7014M', 'Świętokrzyska')],
      trips: [{ routeId: 'M1', serviceId: 'S', tripId: 'M1:KAB', headsign: 'Kabaty', directionId: 0 }],
      frequencies: [{ tripId: 'M1:KAB', ...freqRow }],
      calendarDates: [{ serviceId: 'S', date: '20260902', added: true }],
      stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence', 'M1:KAB,7014M,05:00:00,05:00:00,1'],
    })

  it('expands 05:00–05:23 @ 480s into exactly three departures (05:00, 05:08, 05:16)', async () => {
    const schedule = await buildSchedule(metroInput({ startSec: 5 * 3600, endSec: 5 * 3600 + 23 * 60, headwaySecs: 480 }))
    const secs = Array.from(schedule.evDepSec).sort((a, b) => a - b)
    expect(secs).toEqual([5 * 3600, 5 * 3600 + 480, 5 * 3600 + 960])
    expect(schedule.droppedFrequencies).toBe(0)
  })

  it('drops a headway_secs <= 0 row, counts it, and does NOT loop forever', async () => {
    const zero = await buildSchedule(metroInput({ startSec: 5 * 3600, endSec: 6 * 3600, headwaySecs: 0 }))
    expect(zero.evCount).toBe(0)
    expect(zero.droppedFrequencies).toBe(1)

    const negative = await buildSchedule(metroInput({ startSec: 5 * 3600, endSec: 6 * 3600, headwaySecs: -60 }))
    expect(negative.droppedFrequencies).toBe(1)
  })

  it('drops an end <= start row and counts it', async () => {
    const schedule = await buildSchedule(metroInput({ startSec: 6 * 3600, endSec: 5 * 3600, headwaySecs: 300 }))
    expect(schedule.droppedFrequencies).toBe(1)
  })

  it('a metro departure reaches the board via the normal CSR path (expansion happened at load)', async () => {
    const schedule = await buildSchedule(metroInput({ startSec: 5 * 3600, endSec: 5 * 3600 + 23 * 60, headwaySecs: 480 }))
    const stopIndex = schedule.stopIndexById.get('7014M')!
    const eventsForStop = schedule.stopEventOffset[stopIndex + 1] - schedule.stopEventOffset[stopIndex]
    expect(eventsForStop).toBe(3)
    // wszystkie oznaczone jako pochodzące z frequencies
    for (let k = schedule.stopEventOffset[stopIndex]; k < schedule.stopEventOffset[stopIndex + 1]; k += 1) {
      expect(schedule.tripFrequencyBased[schedule.evTrip[schedule.stopEventOrder[k]]]).toBe(1)
    }
  })
})

describe('buildSchedule — parsowanie stop_times', () => {
  it('reads trip_id by header when it is NOT the first column, and handles quoted fields', async () => {
    const schedule = await buildSchedule(
      makeInput({
        stops: [stop('1001', 'Rondo, główne')],
        trips: [{ routeId: '1', serviceId: 'S', tripId: 'a,b', headsign: null, directionId: 0 }],
        stopTimeLines: [
          'stop_sequence,stop_id,trip_id,arrival_time,departure_time',
          '1,1001,"a,b",06:00:00,06:00:00',
        ],
      })
    )
    expect(schedule.evCount).toBe(1)
    expect(schedule.tripIds[schedule.evTrip[0]]).toBe('a,b')
  })

  it('drops the quoted-first-column ambiguity gracefully when trip_id IS column 0', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [{ routeId: '1', serviceId: 'S', tripId: 'plain', headsign: null, directionId: 0 }],
        stopTimeLines: [
          'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
          '"plain",1001,06:00:00,06:00:00,1',
        ],
      })
    )
    expect(schedule.evCount).toBe(1)
  })
})

describe('buildSchedule — strażniki stop_times', () => {
  it('drops rows with an unparseable time and an unknown stop, counting each', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [{ routeId: '1', serviceId: 'S', tripId: 't', headsign: null, directionId: 0 }],
        stopTimeLines: [
          'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
          't,1001,,,1', // brak obu czasów
          't,9999,06:00:00,06:00:00,2', // nieznany przystanek
          't,1002,06:05:00,06:05:00,3', // ok
        ],
      })
    )
    expect(schedule.evCount).toBe(1)
    expect(schedule.droppedStopTimes).toBe(2)
  })

  it('tolerates a trip whose route is missing and a stop_time with only an arrival time', async () => {
    const schedule = await buildSchedule(
      makeInput({
        routes: [],
        trips: [{ routeId: 'ghost', serviceId: 'S', tripId: 't', headsign: null, directionId: 2 }],
        stopTimeLines: [
          'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
          't,1001,06:00:00,,1', // brak departure_time → używamy arrival
        ],
      })
    )
    expect(schedule.evCount).toBe(1)
    expect(schedule.evDepSec[0]).toBe(6 * 3600)
    expect(schedule.tripRoute[schedule.evTrip[0]]).toBe(-1)
  })

  it('a frequency row that references a trip with no stop_times pattern is dropped and counted', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [{ routeId: '1', serviceId: 'S', tripId: 'freqless', headsign: null, directionId: 0 }],
        frequencies: [{ tripId: 'freqless', startSec: 5 * 3600, endSec: 6 * 3600, headwaySecs: 300 }],
        stopTimeLines: ['trip_id,stop_id,arrival_time,departure_time,stop_sequence'], // brak wierszy
      })
    )
    expect(schedule.droppedFrequencies).toBe(1)
    expect(schedule.evCount).toBe(0)
  })

  it('CSR slice for a stop is sorted by absolute time', async () => {
    const schedule = await buildSchedule(
      makeInput({
        trips: [
          { routeId: '1', serviceId: 'S', tripId: 'late', headsign: null, directionId: 0 },
          { routeId: '1', serviceId: 'S', tripId: 'early', headsign: null, directionId: 0 },
        ],
        stopTimeLines: [
          'trip_id,stop_id,arrival_time,departure_time,stop_sequence',
          'late,1001,20:00:00,20:00:00,1',
          'early,1001,06:00:00,06:00:00,1',
        ],
      })
    )
    const stopIndex = schedule.stopIndexById.get('1001')!
    const lo = schedule.stopEventOffset[stopIndex]
    const a = schedule.stopEventOrder[lo]
    const b = schedule.stopEventOrder[lo + 1]
    expect(schedule.evAbsSec[a]).toBeLessThan(schedule.evAbsSec[b])
  })
})
