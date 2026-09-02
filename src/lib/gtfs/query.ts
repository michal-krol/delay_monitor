/**
 * Odczyt rozkładu w pamięci. Czysty — bierze `GtfsSchedule`, zwraca zwykłe
 * obiekty. Zero pola opóźnienia ani „czasu faktycznego" w żadnym wyjściu.
 */
import { isoInZone } from '@/lib/pkp/time'
import { normalizeForSearch } from '@/lib/search'
import type { GtfsDeparture, GtfsMode, GtfsRoute, GtfsSchedule } from './types'

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
    color: route?.color ?? null,
    headsign: headsignIdx >= 0 ? schedule.headsigns[headsignIdx] : null,
    plannedAt: isoInZone(schedule.evAbsSec[eventIndex] * 1000, schedule.timezone),
    departureSec,
    serviceDate: schedule.serviceDates[day],
    stopId: schedule.stopIds[stopIdx],
    platformCode: schedule.stopPlatforms[stopIdx],
    wheelchair: schedule.stopWheelchair[stopIdx] as 0 | 1 | 2,
    frequencyBased: schedule.tripFrequencyBased[trip] === 1,
  }
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
  wheelchair: 0 | 1 | 2
}

export type StopGroup = {
  id: string
  name: string
  members: StopGroupMember[]
  /** Rodzaje transportu obsługujące ten zespół — do plakietek/filtra. */
  modes: GtfsMode[]
}

export function stopGroup(schedule: GtfsSchedule, id: string): StopGroup | null {
  const memberIndices = schedule.groupMembers.get(id) ?? (schedule.stopIndexById.has(id) ? [schedule.stopIndexById.get(id)!] : [])
  if (memberIndices.length === 0) return null

  const modes = new Set<GtfsMode>()
  for (const stopIndex of memberIndices) {
    const lo = schedule.stopEventOffset[stopIndex]
    const hi = schedule.stopEventOffset[stopIndex + 1]
    for (let k = lo; k < hi; k += 1) {
      const routeIdx = schedule.tripRoute[schedule.evTrip[schedule.stopEventOrder[k]]]
      if (routeIdx >= 0) modes.add(schedule.routes[routeIdx].mode)
    }
  }

  return {
    id,
    name: schedule.groupName.get(id) ?? schedule.stopNames[memberIndices[0]] ?? id,
    members: memberIndices.map((stopIndex) => ({
      id: schedule.stopIds[stopIndex],
      name: schedule.stopNames[stopIndex],
      lat: schedule.stopLat[stopIndex],
      lon: schedule.stopLon[stopIndex],
      platformCode: schedule.stopPlatforms[stopIndex],
      wheelchair: schedule.stopWheelchair[stopIndex] as 0 | 1 | 2,
    })),
    modes: [...modes],
  }
}

const MODE_ORDER: GtfsMode[] = ['metro', 'tram', 'bus', 'rail', 'other']

/** Naturalne sortowanie numerów linii („2" przed „10", „M1" przed „M2"). */
function compareLine(a: GtfsRoute, b: GtfsRoute): number {
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

export type TimetableEntry = {
  tripId: string
  departureSec: number
  plannedAt: string
  headsign: string | null
  frequencyBased: boolean
}

/**
 * Pełna tabliczka dobowa dla pary (przystanek/zespół, linia) w danej dobie
 * kursowania (`serviceDayIndex` 0/1/2). Klasyczna tabliczka na słupku.
 */
export function dayTimetable(
  schedule: GtfsSchedule,
  stopId: string,
  routeId: string,
  serviceDayIndex: number
): TimetableEntry[] {
  const routeIdx = schedule.routeIndexById.get(routeId)
  if (routeIdx === undefined) return []
  const stopIndices = resolveStopIndices(schedule, stopId)

  const entries: TimetableEntry[] = []
  for (const stopIndex of stopIndices) {
    const lo = schedule.stopEventOffset[stopIndex]
    const hi = schedule.stopEventOffset[stopIndex + 1]
    for (let k = lo; k < hi; k += 1) {
      const eventIndex = schedule.stopEventOrder[k]
      const trip = schedule.evTrip[eventIndex]
      if (schedule.tripRoute[trip] !== routeIdx) continue
      if (schedule.tripServiceDay[trip] !== serviceDayIndex) continue
      const headsignIdx = schedule.tripHeadsign[trip]
      entries.push({
        tripId: schedule.tripIds[trip],
        departureSec: schedule.evDepSec[eventIndex],
        plannedAt: isoInZone(schedule.evAbsSec[eventIndex] * 1000, schedule.timezone),
        headsign: headsignIdx >= 0 ? schedule.headsigns[headsignIdx] : null,
        frequencyBased: schedule.tripFrequencyBased[trip] === 1,
      })
    }
  }
  entries.sort((a, b) => a.departureSec - b.departureSec)
  return entries
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
