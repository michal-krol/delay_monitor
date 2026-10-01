import type { GtfsMode, GtfsSchedule, LineKind } from './types'
import { projectVehicle } from './vehicleProject'
import type { VehiclePosition } from './vehicles'

export type CityVehicle = {
  id: string
  lat: number
  lon: number
  bearing: number | null
  sideNumber: string
  ageSec: number
  headsign: string | null
  routeId: string | null
  shortName: string | null
  mode: GtfsMode | null
  /**
   * Rodzaj linii z rozkładu (`lineKindFrom(numer, route_desc)` przy wczytaniu) — kolor pinezki
   * i plakietki. Klient nie wyprowadza go ponownie z numeru: nie zna `route_desc`. `null` razem
   * z `mode`/`shortName` = nieznany kurs.
   */
  kind: LineKind | null
  /** Kierunek przebiegu (`direction_id`) — tryb linii na mapie wybiera nim stronę trasy. */
  directionId: number | null
  /**
   * Najbliższy przystanek przed pojazdem, z rzutu pozycji na przebieg linii
   * (`projectVehicle`). BEZ czasu dojazdu — ten byłby rozkładowy, a udawałby
   * prognozę (#13). `null` = rzut niemożliwy (nieznany kurs, > 2 km od trasy).
   * `code` = numer przystanku w zespole (`stop_code`, fallback `platform_code`) —
   * to JEDEN przystanek, więc UI pokazuje „Centrum 02", nie gołą nazwę zespołu.
   */
  nextStop: { name: string; code: string | null; groupId: string } | null
}

/**
 * Czysta funkcja: WSZYSTKIE pozycje pojazdów miasta (surowe lat/lon, bez rzutu
 * na trasę — w odróżnieniu od `projectVehicle`) + rozkład → lista do mapy
 * miasta live. Pojazd z `trip_id` nieznanym rozkładowi zostaje w liście
 * (routeId/shortName/mode/kind/headsign: null) — prawdziwa pozycja z feedu,
 * nie odrzucamy jej (AGENTS #13: zero pola opóźnienia, ale pozycja to nie
 * opóźnienie).
 */
export function mapCityVehicles(schedule: GtfsSchedule, positions: VehiclePosition[], nowMs: number): CityVehicle[] {
  return positions.map((position) => {
    const ref = schedule.tripPatternRef.get(position.tripId)
    const route = ref !== undefined ? schedule.routes[ref.routeIdx] : undefined
    const pattern = ref !== undefined ? schedule.routePatterns.get(`${ref.routeIdx}:${ref.direction}`) : undefined
    const headsign = pattern !== undefined && pattern.headsignIdx >= 0 ? schedule.headsigns[pattern.headsignIdx] : null

    const projected = projectVehicle(schedule, position, nowMs)
    const nextStopIdx = projected !== null ? pattern?.stops[projected.afterStopOrder + 1] : undefined

    // `position.timestamp` jest zawsze parsowalny — `parseVehicleFeed` odrzuca
    // pozycje bez wiarygodnego czasu u źródła (patrz `vehicles.ts`, #7).
    const ageSec = Math.max(0, Math.floor((nowMs - Date.parse(position.timestamp)) / 1000))

    return {
      id: position.id,
      lat: position.lat,
      lon: position.lon,
      bearing: position.bearing,
      sideNumber: position.sideNumber,
      ageSec,
      headsign,
      routeId: route?.id ?? null,
      shortName: route?.shortName ?? null,
      mode: route?.mode ?? null,
      kind: route?.kind ?? null,
      directionId: ref?.direction ?? null,
      nextStop:
        nextStopIdx !== undefined
          ? {
              name: schedule.stopNames[nextStopIdx],
              code: schedule.stopCodes[nextStopIdx] ?? schedule.stopPlatforms[nextStopIdx] ?? null,
              groupId: schedule.stopGroupIds[nextStopIdx],
            }
          : null,
    }
  })
}
