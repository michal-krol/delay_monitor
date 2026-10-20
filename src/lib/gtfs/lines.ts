/** Linie rozkładu: lista po rodzaju, szczegóły linii z odjazdami. Czysty, zero pola opóźnienia. */
import type { ServiceCategory } from './schema'
import type { GtfsMode, GtfsRoute, GtfsSchedule, LineKind } from './types'

/** Kod `tripCategory` (0-4) → nazwa kategorii dnia. Kolejność sekcji rozkładu. */
export const SERVICE_CATEGORIES: ServiceCategory[] = ['weekday', 'friday', 'saturday', 'sunday', 'other']

export const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

/** Naturalne sortowanie numerów linii („2" przed „10", „M1" przed „M2"). */
export function compareLine(a: GtfsRoute, b: GtfsRoute): number {
  const keyA = a.shortName || a.longName || a.id
  const keyB = b.shortName || b.longName || b.id
  return keyA.localeCompare(keyB, 'pl', { numeric: true, sensitivity: 'base' })
}

export function linesByMode(schedule: GtfsSchedule): Record<GtfsMode, GtfsRoute[]> {
  const grouped: Record<GtfsMode, GtfsRoute[]> = { metro: [], tram: [], bus: [], rail: [], other: [] }
  for (const route of schedule.routes) grouped[route.mode].push(route)
  for (const mode of MODE_ORDER) grouped[mode].sort(compareLine)
  return grouped
}

/** Wiersz strony „Linie" — plakietka linii z nazwą kierunkową. */
export type LineListEntry = {
  routeId: string
  line: string
  longName: string
  mode: GtfsMode
  kind: LineKind
}

function toLineListEntry(route: GtfsRoute): LineListEntry {
  return {
    routeId: route.id,
    line: route.shortName || route.longName || route.id,
    longName: route.longName,
    mode: route.mode,
    kind: route.kind,
  }
}

/** Wszystkie linie miasta pogrupowane po rodzaju, posortowane naturalnie. */
export function allLines(schedule: GtfsSchedule): Record<GtfsMode, LineListEntry[]> {
  const byMode = linesByMode(schedule)
  return {
    metro: byMode.metro.map(toLineListEntry),
    tram: byMode.tram.map(toLineListEntry),
    bus: byMode.bus.map(toLineListEntry),
    rail: byMode.rail.map(toLineListEntry),
    other: byMode.other.map(toLineListEntry),
  }
}

export type LineRouteStop = {
  stopId: string
  groupId: string
  name: string
  /** `stop_code` — numer przystanku („07"), żeby user wiedział, z którego przystanku jedzie linia. */
  code: string | null
  /** `street_name` — ulica, przy której stoi przystanek. `null` gdy feed nie podaje. */
  street: string | null
  wheelchair: 0 | 1 | 2
  lat: number
  lon: number
  /** Sekundy przejazdu od przystanku startowego (do przeliczenia godziny odjazdu na tym przystanku). */
  offsetSec: number
  /** Przystanek na żądanie (`pickup_type`/`drop_off_type` = 3) na tym przebiegu. */
  onRequest: boolean
}
/** Odjazdy z przystanku startowego w jednej kategorii dnia — sekcja rozkładu linii. */
export type LineDepartureBlock = { category: ServiceCategory; times: number[]; frequencyBased: boolean }
export type LineRouteDirection = {
  directionId: number
  headsign: string | null
  /** Nazwa przystanku startowego (pierwszy przystanek przebiegu). */
  origin: string | null
  stops: LineRouteStop[]
  /** Rozkład odjazdów z przystanku startowego, pogrupowany po kategorii dnia. */
  departures: LineDepartureBlock[]
  /** Kontur ulic z `shapes.txt` jako `[lat, lon]`, zaokrąglone do 5 miejsc po przecinku. `null` = wzorzec go nie ma — strona linii spada na łamaną po przystankach. */
  shape: [number, number][] | null
}
export type LineDetail = LineListEntry & { directions: LineRouteDirection[] }

/**
 * Odjazdy z przystanku startowego linii w danym kierunku, pogrupowane po
 * kategorii dnia — z indeksu `run*` (JEDEN wpis na kurs, KAŻDA doba, także spoza
 * okna [wczoraj, dziś, jutro]). Dzięki temu kolumny „soboty" / „niedziele" są
 * zawsze widoczne, niezależnie od tego, jaki dziś dzień tygodnia.
 * `originGroupId` — zespół przystanku startowego przebiegu (kurs może ruszać
 * z dowolnego przystanku tego zespołu).
 */
function lineDeparturesFromRuns(
  schedule: GtfsSchedule,
  routeIdx: number,
  directionId: number,
  originGroupId: string
): LineDepartureBlock[] {
  const frequencyBased = schedule.routeFrequency.has(`${routeIdx}:${directionId}`)
  const byCategory = new Map<number, Set<number>>()
  for (let i = 0; i < schedule.runCount; i += 1) {
    if (schedule.runRoute[i] !== routeIdx || schedule.runDir[i] !== directionId) continue
    if (schedule.stopGroupIds[schedule.runFirstStop[i]] !== originGroupId) continue
    const code = schedule.runCat[i]
    const bucket = byCategory.get(code) ?? new Set<number>()
    bucket.add(schedule.runDepSec[i])
    byCategory.set(code, bucket)
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a - b)
    .map(([code, times]) => ({
      category: SERVICE_CATEGORIES[code] ?? 'other',
      times: [...times].sort((a, b) => a - b),
      frequencyBased,
    }))
}

/**
 * Fallback dla linii częstotliwościowych (metro) — nie mają wpisów `run*`
 * (rozwijane z `frequencies.txt`), więc bierzemy je z wycinka CSR przystanku
 * startowego. Okno [wczoraj, dziś, jutro] wystarcza: metro kursuje podobnie
 * każdego dnia.
 */
function lineDeparturesFromEvents(
  schedule: GtfsSchedule,
  routeIdx: number,
  directionId: number,
  terminusStopIdx: number
): LineDepartureBlock[] {
  const byCategory = new Map<number, { times: Set<number>; frequencyBased: boolean }>()
  const lo = schedule.stopEventOffset[terminusStopIdx]
  const hi = schedule.stopEventOffset[terminusStopIdx + 1]
  for (let k = lo; k < hi; k += 1) {
    const eventIndex = schedule.stopEventOrder[k]
    const trip = schedule.evTrip[eventIndex]
    if (schedule.tripRoute[trip] !== routeIdx || schedule.tripDirection[trip] !== directionId) continue
    const code = schedule.tripCategory[trip]
    const bucket = byCategory.get(code) ?? { times: new Set<number>(), frequencyBased: false }
    bucket.times.add(schedule.evDepSec[eventIndex])
    if (schedule.tripFrequencyBased[trip] === 1) bucket.frequencyBased = true
    byCategory.set(code, bucket)
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a - b)
    .map(([code, bucket]) => ({
      category: SERVICE_CATEGORIES[code] ?? 'other',
      times: [...bucket.times].sort((a, b) => a - b),
      frequencyBased: bucket.frequencyBased,
    }))
}

export const round5 = (value: number): number => Math.round(value * 100000) / 100000

export function shapeToPoints(shape: Float32Array): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i < shape.length; i += 2) points.push([round5(shape[i]), round5(shape[i + 1])])
  return points
}

/**
 * Przebieg linii w obu kierunkach — reprezentatywny wzorzec z `routePatterns`
 * (najdłuższy napotkany przy ładowaniu). `null` = nieznane `routeId`.
 * Zero pola opóźnienia — komunikacja miejska go nie ma.
 */
export function lineDetail(schedule: GtfsSchedule, routeId: string): LineDetail | null {
  const routeIdx = schedule.routeIndexById.get(routeId)
  if (routeIdx === undefined) return null
  const route = schedule.routes[routeIdx]

  const directions: LineRouteDirection[] = []
  for (const directionId of [0, 1, 2]) {
    const pattern = schedule.routePatterns.get(`${routeIdx}:${directionId}`)
    if (pattern === undefined) continue
    const stops = pattern.stops.map((stopIndex, order) => {
      const groupId = schedule.stopGroupIds[stopIndex]
      return {
        stopId: schedule.stopIds[stopIndex],
        groupId,
        name: schedule.groupName.get(groupId) ?? schedule.stopNames[stopIndex],
        code: schedule.stopCodes[stopIndex] ?? schedule.stopPlatforms[stopIndex] ?? null,
        street: schedule.stopStreets[stopIndex] ?? null,
        wheelchair: schedule.stopWheelchair[stopIndex] as 0 | 1 | 2,
        lat: schedule.stopLat[stopIndex],
        lon: schedule.stopLon[stopIndex],
        offsetSec: pattern.offsets[order] ?? 0,
        onRequest: pattern.onRequest[order] === 1,
      }
    })
    const originStopIdx = pattern.stops[0]
    const runsBlocks =
      originStopIdx !== undefined
        ? lineDeparturesFromRuns(schedule, routeIdx, directionId, schedule.stopGroupIds[originStopIdx])
        : []
    // Linie częstotliwościowe (metro) nie mają wpisów `run*` — fallback na CSR.
    const departures =
      runsBlocks.length > 0
        ? runsBlocks
        : originStopIdx !== undefined
          ? lineDeparturesFromEvents(schedule, routeIdx, directionId, originStopIdx)
          : []
    directions.push({
      directionId,
      headsign: pattern.headsignIdx >= 0 ? schedule.headsigns[pattern.headsignIdx] : null,
      origin: stops[0]?.name ?? null,
      stops,
      departures,
      shape: pattern.shape !== null ? shapeToPoints(pattern.shape) : null,
    })
  }

  return { ...toLineListEntry(route), directions }
}
