/** Zespoły przystankowe: skład, linie, podsumowanie doby, wyszukiwarka. Czysty, zero pola opóźnienia. */
import { normalizeForSearch } from '@/lib/search'
import { groupIdOf, resolveStopIndices } from './departures'
import { compareLine, MODE_ORDER } from './lines'
import type { GtfsMode, GtfsRoute, GtfsSchedule, LineKind } from './types'

export type StopGroupMember = {
  id: string
  name: string
  lat: number
  lon: number
  platformCode: string | null
  /** `stop_code` — numer przystanku w zespole („01", „06"). `null` gdy feed nie podaje. */
  code: string | null
  /** `street_name` — ulica, przy której stoi przystanek. Rozróżnia krawędzie zespołu. */
  street: string | null
  wheelchair: 0 | 1 | 2
  /** Linie zatrzymujące się NA TYM przystanku (nie w całym zespole). */
  lines: GtfsLine[]
}

/** Jedna linia obsługująca zespół — plakietka w wyszukiwarce i w szczegółach. */
export type GtfsLine = { routeId: string; line: string; mode: GtfsMode; kind: LineKind }

export type StopGroup = {
  id: string
  name: string
  /** Przystanek podany w żądaniu wprost (deep-link z trasy linii); `null` = pytano o cały zespół. */
  requestedMemberId: string | null
  members: StopGroupMember[]
  /** Rodzaje transportu obsługujące ten zespół — do plakietek/filtra. */
  modes: GtfsMode[]
  /** Linie obsługujące zespół, posortowane naturalnie. */
  lines: GtfsLine[]
  /**
   * Sygnał dostępności zespołu. Feed WTP daje `wheelchair_boarding = 1` na ~89%
   * przystanków (wartość DOMYŚLNA — nie oznaczamy), więc jedyny wartościowy sygnał to
   * `2` = NIEdostępny. `'inaccessible'` = wszystkie przystanki oznaczone `2`,
   * `'partial'` = część, `null` = brak sygnału (nic nie pokazujemy).
   */
  wheelchairNote: 'inaccessible' | 'partial' | null
}


function lineOf(route: GtfsRoute): GtfsLine {
  return {
    routeId: route.id,
    line: route.shortName || route.longName || route.id,
    mode: route.mode,
    kind: route.kind,
  }
}

/** Linie obsługujące zespół — z `groupRoutes` (zbudowanego raz przy ładowaniu). */
export function groupLines(schedule: GtfsSchedule, groupId: string): GtfsLine[] {
  const routeIndices = schedule.groupRoutes.get(groupId)
  if (routeIndices === undefined) return []
  return [...routeIndices]
    .map((index) => schedule.routes[index])
    .filter((route): route is GtfsRoute => route !== undefined)
    .sort(compareLine)
    .map(lineOf)
}

/** Linie zatrzymujące się na JEDNYM przystanku — skan jego wycinka CSR (okno [wczoraj, dziś, jutro]). */
function stopLinesOf(schedule: GtfsSchedule, stopIndex: number): GtfsLine[] {
  const set = new Set<number>()
  for (let k = schedule.stopEventOffset[stopIndex]; k < schedule.stopEventOffset[stopIndex + 1]; k += 1) {
    const routeIdx = schedule.tripRoute[schedule.evTrip[schedule.stopEventOrder[k]]]
    if (routeIdx >= 0) set.add(routeIdx)
  }
  return [...set]
    .map((index) => schedule.routes[index])
    .filter((route): route is GtfsRoute => route !== undefined)
    .sort(compareLine)
    .map(lineOf)
}

export function stopGroup(schedule: GtfsSchedule, id: string): StopGroup | null {
  // Zawsze zwracamy CAŁY zespół — nawet gdy `id` wskazuje pojedynczy przystanek
  // (`701307`). Przystanek podany wprost = `requestedMemberId`, żeby UI mógł go od
  // razu podświetlić w przełączniku (deep-link z trasy linii).
  const groupId = groupIdOf(schedule, id)
  if (groupId === null) return null
  const requestedMemberId = schedule.groupMembers.has(id) ? null : id

  const memberIndices = schedule.groupMembers.get(groupId) ?? []
  if (memberIndices.length === 0) return null

  const lines = groupLines(schedule, groupId)
  const modeOrder = new Map(MODE_ORDER.map((mode, index) => [mode, index]))
  const modes = [...new Set(lines.map((entry) => entry.mode))].sort(
    (a, b) => (modeOrder.get(a) ?? 99) - (modeOrder.get(b) ?? 99)
  )

  return {
    id: groupId,
    requestedMemberId,
    name: schedule.groupName.get(groupId) ?? schedule.stopNames[memberIndices[0]] ?? groupId,
    members: memberIndices.map((stopIndex) => ({
      id: schedule.stopIds[stopIndex],
      name: schedule.stopNames[stopIndex],
      lat: schedule.stopLat[stopIndex],
      lon: schedule.stopLon[stopIndex],
      platformCode: schedule.stopPlatforms[stopIndex],
      code: schedule.stopCodes[stopIndex] ?? null,
      street: schedule.stopStreets[stopIndex] ?? null,
      wheelchair: schedule.stopWheelchair[stopIndex] as 0 | 1 | 2,
      lines: stopLinesOf(schedule, stopIndex),
    })),
    modes,
    lines,
    wheelchairNote: (() => {
      const flagged = memberIndices.filter((stopIndex) => schedule.stopWheelchair[stopIndex] === 2).length
      if (flagged === 0) return null
      return flagged === memberIndices.length ? 'inaccessible' : 'partial'
    })(),
  }
}

export type StopSummary = {
  lineCount: number
  /** Liczba odjazdów zespołu w dobie `serviceDayIndex`. */
  departuresToday: number
  /** Sekunda pierwszego / ostatniego odjazdu tej doby (może być ≥ 86400). `null` = brak kursów. */
  firstDepartureSec: number | null
  lastDepartureSec: number | null
  /** 24 kubełki — liczba odjazdów per godzina zegarowa doby (25:30 → kubełek 1). */
  hourly: number[]
}

/**
 * Fakty rozkładowe o zespole na potrzeby kart podsumowania w szczegółach stopu.
 * Wszystko z rozkładu — zero „na czas", zero „opóźnienie". Jeden skan zdarzeń grupy.
 */
export function stopSummary(schedule: GtfsSchedule, groupId: string, serviceDayIndex: number): StopSummary {
  const stopIndices = resolveStopIndices(schedule, groupId)
  const hourly = new Array<number>(24).fill(0)
  const routeSet = new Set<number>()
  let count = 0
  let firstSec: number | null = null
  let lastSec: number | null = null

  for (const stopIndex of stopIndices) {
    const lo = schedule.stopEventOffset[stopIndex]
    const hi = schedule.stopEventOffset[stopIndex + 1]
    for (let k = lo; k < hi; k += 1) {
      const eventIndex = schedule.stopEventOrder[k]
      const trip = schedule.evTrip[eventIndex]
      if (schedule.tripServiceDay[trip] !== serviceDayIndex) continue
      const routeIdx = schedule.tripRoute[trip]
      if (routeIdx >= 0) routeSet.add(routeIdx)
      const sec = schedule.evDepSec[eventIndex]
      count += 1
      if (firstSec === null || sec < firstSec) firstSec = sec
      if (lastSec === null || sec > lastSec) lastSec = sec
      hourly[Math.floor(sec / 3600) % 24] += 1
    }
  }

  return {
    // Liczba linii z faktycznych odjazdów „dziś" tego zakresu (przystanek albo cały
    // zespół) — nie z `groupRoutes`, które nie zna kluczy przystanków.
    lineCount: routeSet.size,
    departuresToday: count,
    firstDepartureSec: firstSec,
    lastDepartureSec: lastSec,
    hourly,
  }
}

export type StopSearchResult = { id: string; name: string }

type NormalizedStop = { id: string; name: string; normalized: string }

const searchStopsCache = new WeakMap<GtfsSchedule, NormalizedStop[]>()

/**
 * Nazwy zespołów znormalizowane pod wyszukiwarkę (`normalizeForSearch`) — liczone
 * RAZ na rozkład (był wołany na każdą nazwę przy KAŻDYM wyszukiwaniu, i drugi raz
 * w sortowaniu), potem z `WeakMap`.
 */
function normalizedStopsFor(schedule: GtfsSchedule): NormalizedStop[] {
  const cached = searchStopsCache.get(schedule)
  if (cached !== undefined) return cached
  const entries: NormalizedStop[] = []
  for (const [groupId, name] of schedule.groupName) entries.push({ id: groupId, name, normalized: normalizeForSearch(name) })
  searchStopsCache.set(schedule, entries)
  return entries
}

/** Wyszukiwarka zespołów (nie przystanków) — wpada wprost w istniejący `StationSearch`. */
export function searchStops(schedule: GtfsSchedule, query: string, limit: number): StopSearchResult[] {
  const needle = normalizeForSearch(query)
  if (needle.length === 0) return []

  const results: NormalizedStop[] = []
  for (const entry of normalizedStopsFor(schedule)) {
    if (entry.normalized.includes(needle)) {
      results.push(entry)
      if (results.length >= limit * 4) break
    }
  }
  results.sort((a, b) => {
    // Trafienie od początku nazwy przed trafieniem w środku.
    const ap = a.normalized.startsWith(needle) ? 0 : 1
    const bp = b.normalized.startsWith(needle) ? 0 : 1
    return ap - bp || a.normalized.localeCompare(b.normalized, 'pl')
  })
  return results.slice(0, limit).map(({ id, name }) => ({ id, name }))
}
