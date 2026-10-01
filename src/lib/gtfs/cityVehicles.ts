import type { GtfsMode, GtfsSchedule } from './types'
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
  /** Kierunek przebiegu (`direction_id`) — tryb linii na mapie wybiera nim stronę trasy. */
  directionId: number | null
  /**
   * Najbliższy przystanek przed pojazdem, z rzutu pozycji na przebieg linii
   * (`projectVehicle`). BEZ czasu dojazdu — ten byłby rozkładowy, a udawałby
   * prognozę (#13). `null` = rzut niemożliwy (nieznany kurs, > 2 km od trasy).
   */
  nextStop: { name: string; groupId: string } | null
}

/**
 * Czysta funkcja: WSZYSTKIE pozycje pojazdów miasta (surowe lat/lon, bez rzutu
 * na trasę — w odróżnieniu od `projectVehicle`) + rozkład → lista do mapy
 * miasta live. Pojazd z `trip_id` nieznanym rozkładowi zostaje w liście
 * (routeId/shortName/mode/headsign: null) — prawdziwa pozycja z feedu,
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
      directionId: ref?.direction ?? null,
      nextStop:
        nextStopIdx !== undefined
          ? { name: schedule.stopNames[nextStopIdx], groupId: schedule.stopGroupIds[nextStopIdx] }
          : null,
    }
  })
}
