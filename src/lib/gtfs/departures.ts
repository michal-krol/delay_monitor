/**
 * Najbliższe odjazdy z rozkładu (indeks CSR). Czysty — bierze `GtfsSchedule`,
 * zero pola opóźnienia ani „czasu faktycznego".
 */
import { isoInZone } from '@/lib/pkp/time'
import type { GtfsDeparture, GtfsRoute, GtfsSchedule } from './types'

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
  const pattern = schedule.courseTemplates.get(schedule.tripIds[trip])?.pattern
  const sequenceIndex = pattern?.sequences.indexOf(schedule.evSeq[eventIndex]) ?? -1

  return {
    tripId: schedule.tripIds[trip],
    stopSequence: schedule.evSeq[eventIndex],
    stopOccurrence: sequenceIndex < 0 ? 0 : pattern!.stops.slice(0, sequenceIndex).filter((idx) => idx === stopIdx).length,
    directionId: schedule.tripDirection[trip],
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
export function resolveStopIndices(schedule: GtfsSchedule, id: string): number[] {
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
