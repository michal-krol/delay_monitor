/** Statystyki komunikacji miejskiej miasta (widżet sieci). Czysty, zero pola opóźnienia. */
import { linesByMode } from './lines'
import type { GtfsMode, GtfsSchedule, LineKind } from './types'

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
