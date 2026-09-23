import type { GtfsMode, GtfsSchedule } from './types'
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
  color: string | null
}

/**
 * Czysta funkcja: WSZYSTKIE pozycje pojazdów miasta (surowe lat/lon, bez rzutu
 * na trasę — w odróżnieniu od `projectVehicle`) + rozkład → lista do mapy
 * miasta live. Pojazd z `trip_id` nieznanym rozkładowi zostaje w liście
 * (routeId/shortName/mode/color/headsign: null) — prawdziwa pozycja z feedu,
 * nie odrzucamy jej (AGENTS #13: zero pola opóźnienia, ale pozycja to nie
 * opóźnienie).
 */
export function mapCityVehicles(schedule: GtfsSchedule, positions: VehiclePosition[], nowMs: number): CityVehicle[] {
  return positions.map((position) => {
    const ref = schedule.tripPatternRef.get(position.tripId)
    const route = ref !== undefined ? schedule.routes[ref.routeIdx] : undefined
    const pattern = ref !== undefined ? schedule.routePatterns.get(`${ref.routeIdx}:${ref.direction}`) : undefined
    const headsign = pattern !== undefined && pattern.headsignIdx >= 0 ? schedule.headsigns[pattern.headsignIdx] : null

    const parsed = Date.parse(position.timestamp)
    const ageSec = Number.isFinite(parsed) ? Math.max(0, Math.floor((nowMs - parsed) / 1000)) : 0

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
      color: route?.color ?? null,
    }
  })
}
