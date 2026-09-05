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
    color: route?.color ?? null,
    headsign: headsignIdx >= 0 ? schedule.headsigns[headsignIdx] : null,
    plannedAt: isoInZone(schedule.evAbsSec[eventIndex] * 1000, schedule.timezone),
    departureSec,
    serviceDate: schedule.serviceDates[day],
    stopId: schedule.stopIds[stopIdx],
    platformCode: schedule.stopPlatforms[stopIdx],
    /** Numer słupka w zespole (`stop_code`, „01"/„07") — z którego słupka rusza ten kurs. */
    stopCode: schedule.stopCodes[stopIdx] ?? null,
    wheelchair: schedule.stopWheelchair[stopIdx] as 0 | 1 | 2,
    frequencyBased: schedule.tripFrequencyBased[trip] === 1,
    onRequest: schedule.evOnRequest[eventIndex] === 1,
  }
}

/** Id zespołu dla dowolnego `id` (zespół albo słupek). `null` = nieznane. */
export function groupIdOf(schedule: GtfsSchedule, id: string): string | null {
  if (schedule.groupMembers.has(id)) return id
  const index = schedule.stopIndexById.get(id)
  return index === undefined ? null : schedule.stopGroupIds[index]
}

/** Indeksy słupków wskazane przez `id` — sam słupek albo cały zespół. */
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
 * Najbliższe `limit` odjazdów dla listy identyfikatorów (słupków lub zespołów).
 * `nowMs` — chwila odniesienia; zdarzenia wcześniejsze są pomijane.
 * O(log k + N) na słupek, liniowe scalenie ≤ MAX_MERGED_RUNS przebiegów.
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
  /** `stop_code` — numer słupka w zespole („01", „06"). `null` gdy feed nie podaje. */
  code: string | null
  /** `street_name` — ulica, przy której stoi słupek. Rozróżnia krawędzie zespołu. */
  street: string | null
  wheelchair: 0 | 1 | 2
  /** Linie zatrzymujące się NA TYM słupku (nie w całym zespole). */
  lines: GtfsLine[]
}

/** Jedna linia obsługująca zespół — plakietka w wyszukiwarce i w szczegółach. */
export type GtfsLine = { routeId: string; line: string; color: string | null; mode: GtfsMode; kind: LineKind }

export type StopGroup = {
  id: string
  name: string
  /** Słupek podany w żądaniu wprost (deep-link z trasy linii); `null` = pytano o cały zespół. */
  requestedMemberId: string | null
  members: StopGroupMember[]
  /** Rodzaje transportu obsługujące ten zespół — do plakietek/filtra. */
  modes: GtfsMode[]
  /** Linie obsługujące zespół, posortowane naturalnie. */
  lines: GtfsLine[]
  /**
   * Sygnał dostępności zespołu. Feed WTP daje `wheelchair_boarding = 1` na ~89%
   * słupków (wartość DOMYŚLNA — nie oznaczamy), więc jedyny wartościowy sygnał to
   * `2` = NIEdostępny. `'inaccessible'` = wszystkie słupki oznaczone `2`,
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
    color: route.color,
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

/** Linie zatrzymujące się na JEDNYM słupku — skan jego wycinka CSR (okno [wczoraj, dziś, jutro]). */
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
  // Zawsze zwracamy CAŁY zespół — nawet gdy `id` wskazuje pojedynczy słupek
  // (`701307`). Słupek podany wprost = `requestedMemberId`, żeby UI mógł go od
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

/** Wiersz przeglądarki „Trasy" — plakietka linii z nazwą kierunkową. */
export type LineListEntry = {
  routeId: string
  line: string
  longName: string
  color: string | null
  textColor: '#000000' | '#ffffff'
  mode: GtfsMode
  kind: LineKind
}

function toLineListEntry(route: GtfsRoute): LineListEntry {
  return {
    routeId: route.id,
    line: route.shortName || route.longName || route.id,
    longName: route.longName,
    color: route.color,
    textColor: route.textColor,
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
  /** `stop_code` — numer słupka („07"), żeby user wiedział, z którego słupka jedzie linia. */
  code: string | null
  /** `street_name` — ulica, przy której stoi słupek. `null` gdy feed nie podaje. */
  street: string | null
  wheelchair: 0 | 1 | 2
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
}
export type LineDetail = LineListEntry & { directions: LineRouteDirection[] }

/**
 * Odjazdy z przystanku startowego linii w danym kierunku, pogrupowane po
 * kategorii dnia — z indeksu `run*` (JEDEN wpis na kurs, KAŻDA doba, także spoza
 * okna [wczoraj, dziś, jutro]). Dzięki temu kolumny „soboty" / „niedziele" są
 * zawsze widoczne, niezależnie od tego, jaki dziś dzień tygodnia.
 * `originGroupId` — zespół przystanku startowego przebiegu (kurs może ruszać
 * z dowolnego słupka tego zespołu).
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
    // Liczba linii z faktycznych odjazdów „dziś" tego zakresu (słupek albo cały
    // zespół) — nie z `groupRoutes`, które nie zna kluczy słupków.
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
  /** Liczba kursów w dobie „dziś" (jeden kurs = jeden przejazd pojazdu, NIE zdarzenie na słupku). */
  tripsToday: number
  /** Sekunda pierwszego / ostatniego ROZPOCZĘTEGO kursu dziś. `null` = brak. */
  firstDepartureSec: number | null
  lastDepartureSec: number | null
  /** 24 kubełki — liczba kursów rozpoczętych w danej godzinie zegarowej (spójne z `tripsToday`). */
  hourly: number[]
}

/**
 * Statystyki komunikacji miejskiej miasta na potrzeby widżetu sieci. Wszystko
 * z rozkładu — zero pozycji pojazdów, zero „w trasie" (dochodzi w etapie 5).
 */
export function cityStats(schedule: GtfsSchedule, todayIndex: number): CityStats {
  const byMode = linesByMode(schedule)
  const linesByModeCount: Record<GtfsMode, number> = {
    metro: byMode.metro.length,
    tram: byMode.tram.length,
    bus: byMode.bus.length,
    rail: byMode.rail.length,
    other: byMode.other.length,
  }

  const busKinds: Record<LineKind, number> = { regular: 0, night: 0, express: 0, replacement: 0 }
  for (const route of byMode.bus) busKinds[route.kind] += 1

  // Pierwszy odjazd każdego kursu „dziś" — jeden skan zdarzeń. Wcześniej `hourly`
  // liczyło ZDARZENIA na słupkach (~1 mln/dobę) obok `tripsToday` liczącego kursy
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

  return {
    linesByMode: linesByModeCount,
    busKinds,
    stopGroupCount: schedule.groupMembers.size,
    modeCount: (Object.values(linesByModeCount) as number[]).filter((count) => count > 0).length,
    tripsToday,
    firstDepartureSec: firstSec,
    lastDepartureSec: lastSec,
    hourly,
  }
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
  const position = positions.find((p) => p.tripId === tripId)
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

/** Wyszukiwarka zespołów (nie słupków) — wpada wprost w istniejący `StationSearch`. */
export function searchStops(schedule: GtfsSchedule, query: string, limit: number): StopSearchResult[] {
  const needle = normalizeForSearch(query)
  if (needle.length === 0) return []

  const results: StopSearchResult[] = []
  for (const [groupId, name] of schedule.groupName) {
    if (normalizeForSearch(name).includes(needle)) {
      results.push({ id: groupId, name })
      if (results.length >= limit * 4) break
    }
  }
  results.sort((a, b) => {
    const an = normalizeForSearch(a.name)
    const bn = normalizeForSearch(b.name)
    // Trafienie od początku nazwy przed trafieniem w środku.
    const ap = an.startsWith(needle) ? 0 : 1
    const bp = bn.startsWith(needle) ? 0 : 1
    return ap - bp || an.localeCompare(bn, 'pl')
  })
  return results.slice(0, limit)
}
