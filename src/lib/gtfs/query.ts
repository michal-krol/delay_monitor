/**
 * Odczyt rozkładu w pamięci. Czysty — bierze `GtfsSchedule`, zwraca zwykłe
 * obiekty. Zero pola opóźnienia ani „czasu faktycznego" w żadnym wyjściu.
 */
import { isoInZone } from '@/lib/pkp/time'
import { normalizeForSearch } from '@/lib/search'
import type { AlertRecord } from './alerts'
import type { ServiceCategory } from './schema'
import type { GtfsDeparture, GtfsMode, GtfsRoute, GtfsSchedule, LineKind } from './types'
import { projectVehicle } from './vehicleProject'
import type { VehiclePosition } from './vehicles'

/** Kod `tripCategory` (0-4) → nazwa kategorii dnia. Kolejność sekcji rozkładu. */
export const SERVICE_CATEGORIES: ServiceCategory[] = ['weekday', 'friday', 'saturday', 'sunday', 'other']

/** Ile posortowanych przebiegów najwyżej scalamy dla jednego zespołu. */
const MAX_MERGED_RUNS = 12

function eventDeparture(schedule: GtfsSchedule, eventIndex: number): GtfsDeparture {
  const trip = schedule.evTrip[eventIndex]
  const routeIdx = schedule.tripRoute[trip]
  const route: GtfsRoute | undefined = routeIdx >= 0 ? schedule.routes[routeIdx] : undefined
  const headsignIdx = schedule.tripHeadsign[trip]
  const stopIdx = schedule.evStop[eventIndex]
  const day = schedule.tripServiceDay[trip]
  const departureSec = schedule.evDepSec[eventIndex]

  return {
    tripId: schedule.tripIds[trip],
    routeId: route?.id ?? '',
    line: route?.shortName || route?.longName || route?.id || '',
    mode: route?.mode ?? 'other',
    lineKind: route?.kind ?? 'regular',
    headsign: headsignIdx >= 0 ? schedule.headsigns[headsignIdx] : null,
    plannedAt: isoInZone(schedule.evAbsSec[eventIndex] * 1000, schedule.timezone),
    departureSec,
    serviceDate: schedule.serviceDates[day],
    stopId: schedule.stopIds[stopIdx],
    platformCode: schedule.stopPlatforms[stopIdx],
    /** Numer przystanku w zespole (`stop_code`, „01"/„07") — z którego przystanku rusza ten kurs. */
    stopCode: schedule.stopCodes[stopIdx] ?? null,
    wheelchair: schedule.stopWheelchair[stopIdx] as 0 | 1 | 2,
    frequencyBased: schedule.tripFrequencyBased[trip] === 1,
    onRequest: schedule.evOnRequest[eventIndex] === 1,
  }
}

/** Id zespołu dla dowolnego `id` (zespół albo przystanek). `null` = nieznane. */
export function groupIdOf(schedule: GtfsSchedule, id: string): string | null {
  if (schedule.groupMembers.has(id)) return id
  const index = schedule.stopIndexById.get(id)
  return index === undefined ? null : schedule.stopGroupIds[index]
}

/** Indeksy przystanków wskazane przez `id` — sam przystanek albo cały zespół. */
function resolveStopIndices(schedule: GtfsSchedule, id: string): number[] {
  const direct = schedule.stopIndexById.get(id)
  const group = schedule.groupMembers.get(id)
  if (group !== undefined && (direct === undefined || group.length > 1)) return group
  return direct === undefined ? [] : [direct]
}

/** Najwcześniejszy indeks w wycinku CSR, dla którego `evAbsSec >= thresholdSec`. */
function lowerBound(schedule: GtfsSchedule, lo: number, hi: number, thresholdSec: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (schedule.evAbsSec[schedule.stopEventOrder[mid]] < thresholdSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Najbliższe `limit` odjazdów dla listy identyfikatorów (przystanków lub zespołów).
 * `nowMs` — chwila odniesienia; zdarzenia wcześniejsze są pomijane.
 * O(log k + N) na przystanek, liniowe scalenie ≤ MAX_MERGED_RUNS przebiegów.
 */
export function nextDepartures(
  schedule: GtfsSchedule,
  ids: string[],
  nowMs: number,
  limit: number
): GtfsDeparture[] {
  const thresholdSec = Math.floor(nowMs / 1000)
  const stopIndices = new Set<number>()
  for (const id of ids) for (const index of resolveStopIndices(schedule, id)) stopIndices.add(index)

  const candidates: number[] = []
  let runs = 0
  for (const stopIndex of stopIndices) {
    if (runs >= MAX_MERGED_RUNS) break
    runs += 1
    const lo = schedule.stopEventOffset[stopIndex]
    const hi = schedule.stopEventOffset[stopIndex + 1]
    let cursor = lowerBound(schedule, lo, hi, thresholdSec)
    for (let taken = 0; taken < limit && cursor < hi; taken += 1, cursor += 1) {
      candidates.push(schedule.stopEventOrder[cursor])
    }
  }

  candidates.sort((a, b) => schedule.evAbsSec[a] - schedule.evAbsSec[b])
  return candidates.slice(0, limit).map((eventIndex) => eventDeparture(schedule, eventIndex))
}

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

const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

/** Naturalne sortowanie numerów linii („2" przed „10", „M1" przed „M2"). */
function compareLine(a: GtfsRoute, b: GtfsRoute): number {
  const keyA = a.shortName || a.longName || a.id
  const keyB = b.shortName || b.longName || b.id
  return keyA.localeCompare(keyB, 'pl', { numeric: true, sensitivity: 'base' })
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

const round5 = (value: number): number => Math.round(value * 100000) / 100000

function shapeToPoints(shape: Float32Array): [number, number][] {
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

export type CityStats = {
  /** Liczba linii per rodzaj środka. */
  linesByMode: Record<GtfsMode, number>
  /** Liczba linii autobusowych per rodzaj (nocna/przyspieszona/…). */
  busKinds: Record<LineKind, number>
  /** Liczba zespołów przystankowych. */
  stopGroupCount: number
  /** Liczba środków transportu obecnych w feedzie (rodzaje z ≥1 linią). */
  modeCount: number
  /** Liczba kursów w dobie „dziś" (jeden kurs = jeden przejazd pojazdu, NIE zdarzenie na przystanku). */
  tripsToday: number
  /** Sekunda pierwszego / ostatniego ROZPOCZĘTEGO kursu dziś. `null` = brak. */
  firstDepartureSec: number | null
  lastDepartureSec: number | null
  /** 24 kubełki — liczba kursów rozpoczętych w danej godzinie zegarowej (spójne z `tripsToday`). */
  hourly: number[]
}

const cityStatsCache = new WeakMap<GtfsSchedule, Map<number, CityStats>>()

/**
 * Statystyki komunikacji miejskiej miasta na potrzeby widżetu sieci. Wszystko
 * z rozkładu — zero pozycji pojazdów, zero „w trasie" (dochodzi w etapie 5).
 * Liczone RAZ na `(schedule, todayIndex)` — jeden pełny skan zdarzeń — potem
 * z `WeakMap`; rozkład przeładowany = nowy obiekt = nowy wpis. Wewnętrzna mapa
 * trzyma najwyżej garść dni (okno [wczoraj, dziś, jutro]).
 */
export function cityStats(schedule: GtfsSchedule, todayIndex: number): CityStats {
  let byDay = cityStatsCache.get(schedule)
  if (byDay === undefined) {
    byDay = new Map()
    cityStatsCache.set(schedule, byDay)
  }
  const cached = byDay.get(todayIndex)
  if (cached !== undefined) return cached

  const byMode = linesByMode(schedule)
  const linesByModeCount: Record<GtfsMode, number> = {
    metro: byMode.metro.length,
    tram: byMode.tram.length,
    bus: byMode.bus.length,
    rail: byMode.rail.length,
    other: byMode.other.length,
  }

  const busKinds: Record<LineKind, number> = { regular: 0, night: 0, express: 0, replacement: 0, zone: 0, local: 0 }
  for (const route of byMode.bus) busKinds[route.kind] += 1

  // Pierwszy odjazd każdego kursu „dziś" — jeden skan zdarzeń. Wcześniej `hourly`
  // liczyło ZDARZENIA na przystankach (~1 mln/dobę) obok `tripsToday` liczącego kursy
  // (~35 tys.) — dwie różne skale w jednym widżecie. Teraz oba liczą kursy.
  const firstDep = new Int32Array(schedule.tripIds.length).fill(-1)
  for (let e = 0; e < schedule.evCount; e += 1) {
    const trip = schedule.evTrip[e]
    if (schedule.tripServiceDay[trip] !== todayIndex) continue
    const sec = schedule.evDepSec[e]
    if (firstDep[trip] === -1 || sec < firstDep[trip]) firstDep[trip] = sec
  }

  const hourly = new Array<number>(24).fill(0)
  let tripsToday = 0
  let firstSec: number | null = null
  let lastSec: number | null = null
  for (let trip = 0; trip < firstDep.length; trip += 1) {
    const sec = firstDep[trip]
    if (sec === -1) continue
    tripsToday += 1
    if (firstSec === null || sec < firstSec) firstSec = sec
    if (lastSec === null || sec > lastSec) lastSec = sec
    hourly[Math.floor(sec / 3600) % 24] += 1
  }

  const result: CityStats = {
    linesByMode: linesByModeCount,
    busKinds,
    stopGroupCount: schedule.groupMembers.size,
    modeCount: (Object.values(linesByModeCount) as number[]).filter((count) => count > 0).length,
    tripsToday,
    firstDepartureSec: firstSec,
    lastDepartureSec: lastSec,
    hourly,
  }
  byDay.set(todayIndex, result)
  return result
}

/**
 * Ilu pojazdów jedzie teraz per rodzaj środka — czysty rzut pozycji z feedu
 * (`vehicles.json`) na linie rozkładu przez `tripPatternRef`. Zero pola
 * opóźnienia. Pozycja z nieznanym `tripId` idzie do `unmatched`, NIE do kubełka.
 */
export function vehiclesInService(
  schedule: GtfsSchedule,
  positions: VehiclePosition[]
): { counts: Record<GtfsMode, number>; unmatched: number } {
  const counts: Record<GtfsMode, number> = { metro: 0, tram: 0, bus: 0, rail: 0, other: 0 }
  let unmatched = 0
  for (const p of positions) {
    const ref = schedule.tripPatternRef.get(p.tripId)
    const route = ref === undefined ? undefined : schedule.routes[ref.routeIdx]
    if (route === undefined) {
      unmatched += 1
      continue
    }
    counts[route.mode] += 1
  }
  return { counts, unmatched }
}

const positionsByTripCache = new WeakMap<VehiclePosition[], Map<string, VehiclePosition>>()

/**
 * Indeks `tripId → pierwsza pozycja` (semantyka `Array.prototype.find`) — liczony
 * raz na tablicę `positions` jednego cyklu `VehiclePoller` (ta sama tablica/te same
 * obiekty między pollami, patrz `vehiclePoller.getPositions()`), potem z `WeakMap`.
 * Nowy poll = nowa tablica = nowy wpis, stary naturalnie odpada z GC.
 */
function indexPositionsByTrip(positions: VehiclePosition[]): Map<string, VehiclePosition> {
  const cached = positionsByTripCache.get(positions)
  if (cached !== undefined) return cached
  const index = new Map<string, VehiclePosition>()
  for (const p of positions) if (!index.has(p.tripId)) index.set(p.tripId, p)
  positionsByTripCache.set(positions, index)
  return index
}

/**
 * Ile przystanków przed `stopIdx` jest teraz pojazd realizujący `tripId` —
 * czysty rzut pozycji (`projectVehicle`) na przebieg linii. `stopsAway === 0`
 * = „pojazd na odcinku tuż przed tym przystankiem" — zbliża się, NIE odjechał
 * (przyszłe odjazdy). `null` gdy: brak pozycji
 * dla `tripId`, pojazd poza trasą, `stopIdx` nie leży na przebiegu, albo pojazd
 * ten przystanek już minął (`stopsAway < 0` NIE wychodzi jako liczba ujemna).
 * Zero pola opóźnienia — niesie tylko dystans w przystankach i wiek danych.
 */
export function vehicleForStop(
  schedule: GtfsSchedule,
  positions: VehiclePosition[],
  tripId: string,
  stopIdx: number,
  nowMs: number
): { stopsAway: number; ageSec: number } | null {
  const position = indexPositionsByTrip(positions).get(tripId)
  if (position === undefined) return null
  const on = projectVehicle(schedule, position, nowMs)
  if (on === null) return null
  const ref = schedule.tripPatternRef.get(tripId)
  if (ref === undefined) return null
  const pattern = schedule.routePatterns.get(`${ref.routeIdx}:${ref.direction}`)
  if (pattern === undefined) return null
  const thisOrder = pattern.stops.indexOf(stopIdx)
  if (thisOrder < 0) return null
  const stopsAway = thisOrder - on.afterStopOrder - 1
  if (stopsAway < 0) return null
  return { stopsAway, ageSec: on.ageSec }
}

/**
 * Dopasowanie alertów do zbioru linii (indeksów `routes`). Feed `alerts.json`
 * nie zna przystanków — jedyny klucz to `route.shortName` (#13). Wołający
 * dostarcza zbiór: jedna linia (strona linii) albo `groupRoutes.get(groupId)`
 * (przystanek). Miasto (widżet globalny) nie woła tej funkcji — zwraca całą
 * listę bez filtra.
 */
export function alertsForRoutes(
  schedule: GtfsSchedule,
  alerts: AlertRecord[],
  routeIdxs: ReadonlySet<number>
): AlertRecord[] {
  if (routeIdxs.size === 0 || alerts.length === 0) return []
  const shortNames = new Set<string>()
  for (const idx of routeIdxs) shortNames.add(schedule.routes[idx].shortName)
  return alerts.filter((a) => a.routes.some((r) => shortNames.has(r)))
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

/** Punkt przystanku na mapie miasta — przystanek albo (dla metra) cała stacja-rodzic. Bez pola opóźnienia (#13). */
export type CityStop = {
  id: string
  groupId: string
  name: string
  /** `stop_code` przystanku („01"); `null` dla stacji-rodzica i gdy feed nie podaje. */
  code: string | null
  lat: number
  lon: number
  /** Dominujący rodzaj obsługujących linii (kolejność `MODE_ORDER`: metro > tramwaj > autobus). */
  mode: Exclude<GtfsMode, 'rail'>
}

const cityStopsCache = new WeakMap<GtfsSchedule, CityStop[]>()

/**
 * Wszystkie przystanki miasta z pozycją — warstwa przystanków na mapie miasta.
 * Liczone RAZ na załadowany rozkład (skan wycinków CSR wszystkich przystanków),
 * potem z `WeakMap` — rozkład przeładowany = nowy obiekt = nowy wpis.
 *
 * - Przystanek z rodzicem (peron metra) zwija się do rodzica: jeden punkt na stację.
 * - Pomijane: brak kursów w oknie [wczoraj, dziś, jutro], pozycja (0,0) (schema
 *   daje `0` przy braku współrzędnych) i przystanki wyłącznie kolejowe — kolej to
 *   osobna warstwa stacji PKP.
 */
export function cityStops(schedule: GtfsSchedule): CityStop[] {
  const cached = cityStopsCache.get(schedule)
  if (cached !== undefined) return cached

  const n = schedule.stopIds.length
  const rank = new Map(MODE_ORDER.map((mode, index) => [mode, index]))
  // Najlepsza (najniższa) ranga trybu per punkt — przystanki dzieci zasilają rodzica.
  const bestRank = new Int8Array(n).fill(99)
  const hasChild = new Uint8Array(n)
  for (let s = 0; s < n; s += 1) {
    const target = schedule.stopParent[s] >= 0 ? schedule.stopParent[s] : s
    if (target !== s) hasChild[target] = 1
    for (let k = schedule.stopEventOffset[s]; k < schedule.stopEventOffset[s + 1]; k += 1) {
      const routeIdx = schedule.tripRoute[schedule.evTrip[schedule.stopEventOrder[k]]]
      if (routeIdx < 0) continue
      const r = rank.get(schedule.routes[routeIdx].mode) ?? 99
      if (r < bestRank[target]) bestRank[target] = r
    }
  }

  const stops: CityStop[] = []
  for (let s = 0; s < n; s += 1) {
    if (schedule.stopParent[s] >= 0) continue
    const mode = MODE_ORDER[bestRank[s]]
    if (mode === undefined || mode === 'rail') continue
    const lat = schedule.stopLat[s]
    const lon = schedule.stopLon[s]
    if (lat === 0 && lon === 0) continue
    const isParent = hasChild[s] === 1
    stops.push({
      id: schedule.stopIds[s],
      groupId: schedule.stopGroupIds[s],
      name: isParent ? (schedule.groupName.get(schedule.stopGroupIds[s]) ?? schedule.stopNames[s]) : schedule.stopNames[s],
      code: isParent ? null : (schedule.stopCodes[s] ?? schedule.stopPlatforms[s] ?? null),
      lat: round5(lat),
      lon: round5(lon),
      mode,
    })
  }
  cityStopsCache.set(schedule, stops)
  return stops
}

/** Środek zespołu (średnia przystanków z pozycją) — cel `flyTo` z wyszukiwarki. `null` gdy żaden przystanek nie ma pozycji. */
export function groupCentroid(schedule: GtfsSchedule, groupId: string): { lat: number; lon: number } | null {
  let lat = 0
  let lon = 0
  let count = 0
  for (const s of schedule.groupMembers.get(groupId) ?? []) {
    if (schedule.stopLat[s] === 0 && schedule.stopLon[s] === 0) continue
    lat += schedule.stopLat[s]
    lon += schedule.stopLon[s]
    count += 1
  }
  return count === 0 ? null : { lat: round5(lat / count), lon: round5(lon / count) }
}

/** Przebieg linii szynowej (metro / kolej miejska) jako tło orientacyjne mapy. */
export type BackboneLine = {
  routeId: string
  line: string
  mode: 'metro' | 'rail'
  points: [number, number][]
}

/**
 * Metro i kolej miejska — stałe tło mapy (widoczne od dalekiego zoomu, gdy
 * przystanki jeszcze się nie pokazują). Jeden kierunek na linię wystarcza (tory
 * te same); kształt `shapes.txt`, a bez niego łamana po przystankach. Z gotowego
 * indeksu `routePatterns` — bez skanu `stop_times`.
 */
export function backboneLines(schedule: GtfsSchedule): BackboneLine[] {
  const lines: BackboneLine[] = []
  schedule.routes.forEach((route, routeIdx) => {
    if (route.mode !== 'metro' && route.mode !== 'rail') return
    const pattern = schedule.routePatterns.get(`${routeIdx}:0`) ?? schedule.routePatterns.get(`${routeIdx}:1`)
    if (pattern === undefined) return
    const points =
      pattern.shape !== null && pattern.shape.length >= 4
        ? shapeToPoints(pattern.shape)
        : pattern.stops.map((s): [number, number] => [round5(schedule.stopLat[s]), round5(schedule.stopLon[s])])
    if (points.length < 2) return
    lines.push({ routeId: route.id, line: route.shortName || route.id, mode: route.mode, points })
  })
  return lines
}
