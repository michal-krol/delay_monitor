import { buildSchedule, type BuildScheduleInput } from './schedule'
import { lineKindFrom, modeFromRouteType } from './schema'
import type { GtfsRoute } from './types'

export const TZ = 'Europe/Warsaw'
export const DATES: [string, string, string] = ['2026-09-01', '2026-09-02', '2026-09-03']

export function route(id: string, type: number, shortName = id): GtfsRoute {
  return { id, shortName, longName: shortName, mode: modeFromRouteType(type), kind: lineKindFrom(shortName, undefined) }
}
export function stop(id: string, name: string, parentId: string | null = null) {
  return { id, name, lat: 52, lon: 21, locationType: '0', parentId, platformCode: null, wheelchair: 0 as const }
}

export function make(over: Partial<Omit<BuildScheduleInput, 'shapeLines'>> & { shapeLines?: string[] }) {
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
    shapeLines: over.shapeLines !== undefined ? async () => over.shapeLines! : undefined,
  })
}

/** ms w chwili `hh:mm` czasu warszawskiego dnia 2026-09-02 (CEST → −2h do UTC). */
export const waw0902 = (hh: number, mm = 0) => Date.parse(`2026-09-02T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`)
