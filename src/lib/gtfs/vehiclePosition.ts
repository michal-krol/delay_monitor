/**
 * Pozycja pojazdu na mapie linii, odtworzona z rzutu serwera (`afterStopOrder` +
 * `fraction`) i współrzędnych przystanków przebiegu -- surowe lat/lon pojazdu nie
 * wychodzi z serwera (#13). Prosta interpolacja po przystankach, więc zakręty
 * między nimi są spłaszczone (ta sama geometria co `projectVehicle`).
 * `null` = odcinek nie istnieje w tym przebiegu (np. przebieg odświeżył się po pobraniu pojazdów).
 */
export function vehicleLatLon(
  stops: ReadonlyArray<{ lat: number; lon: number }>,
  vehicle: { afterStopOrder: number; fraction: number }
): { lat: number; lon: number } | null {
  const a = stops[vehicle.afterStopOrder]
  const b = stops[vehicle.afterStopOrder + 1]
  if (a === undefined || b === undefined) return null
  const t = Math.max(0, Math.min(1, vehicle.fraction))
  const lat = a.lat + (b.lat - a.lat) * t
  const lon = a.lon + (b.lon - a.lon) * t
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}
