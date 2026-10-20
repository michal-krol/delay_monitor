/** Nakładka „na żywo": pozycje pojazdów i alerty zrzutowane na rozkład. Czysty, zero pola opóźnienia. */
import type { AlertRecord } from './alerts'
import type { GtfsMode, GtfsSchedule } from './types'
import { projectVehicle } from './vehicleProject'
import type { VehiclePosition } from './vehicles'

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
