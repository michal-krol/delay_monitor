import type { CityStop } from '@/lib/gtfs/query'
import type { MapRailStation } from '@/lib/weather/coordinates'
import { MAP_ZOOM, POLAND_BOUNDS, boundsContain } from './mapData'

/** Czysta warstwa kamery mapy transportu: `?at=`, promień prywatności widoku, „w pobliżu". Bez DOM i bez MapLibre. */

export type MapCamera = { lat: number; lon: number; zoom: number }

/** `?at=lat,lon,zoom` → kadr; poza Polską / zły format = `null` (po cichu, AGENTS.md #4). */
export function parseAt(value: string | null): MapCamera | null {
  if (value === null) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [lat, lon, zoom] = parts
  if (!boundsContain(POLAND_BOUNDS, lon, lat) || zoom < MAP_ZOOM.min || zoom > 19) return null
  return { lat, lon, zoom }
}

/** Kadr → `?at=` (5 miejsc ≈ 1 m, zoom do 0,1). */
export function formatAt(camera: MapCamera): string {
  return `${camera.lat.toFixed(5)},${camera.lon.toFixed(5)},${camera.zoom.toFixed(1)}`
}

/**
 * Promień prywatności widoku: tyle od pozycji użytkownika kadr uznajemy za „na nim" (zoom wokół kursora/palca przesuwa środek o mniej niż połowę odległości gestu).
 * Liczony stałą kafla 256 px, a MapLibre rysuje kafle 512 px — realnie to ~300 px ekranu. Celowo hojnie (fail closed, `maps.md`).
 */
export const PRIVACY_RADIUS_PX = 150

/** Czy środek kadru leży w promieniu `PRIVACY_RADIUS_PX` od `point` przy danym zoomie (m/px = 156543,03·cos φ / 2^zoom — 2× więcej niż przy kaflach 512 px, czyli ostrożnie). */
export function isNearViewPoint(center: { lat: number; lon: number }, zoom: number, point: { lat: number; lon: number }): boolean {
  const metersPerPx = (156543.03 * Math.cos((point.lat * Math.PI) / 180)) / 2 ** zoom
  return distanceM(center, point) <= PRIVACY_RADIUS_PX * metersPerPx
}

/** Odległość po powierzchni Ziemi w metrach (haversine). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export type NearbyPoint =
  | { kind: 'rail'; id: string; name: string; lat: number; lon: number; distanceM: number }
  | { kind: 'stop'; stop: CityStop; distanceM: number }

/**
 * „Co jest w pobliżu" punktu na mapie — stacje i przystanki w promieniu,
 * od najbliższego. Liniowo po listach, które klient i tak ma (~7 tys. + ~3 tys.).
 */
export function nearbyPoints(
  point: { lat: number; lon: number },
  stops: CityStop[],
  stations: MapRailStation[],
  radiusM = 500,
  limit = 8
): NearbyPoint[] {
  const found: NearbyPoint[] = []
  for (const stop of stops) {
    const d = distanceM(point, stop)
    if (d <= radiusM) found.push({ kind: 'stop', stop, distanceM: d })
  }
  for (const station of stations) {
    const d = distanceM(point, station)
    if (d <= radiusM) found.push({ kind: 'rail', id: station.id, name: station.name, lat: station.lat, lon: station.lon, distanceM: d })
  }
  return found.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit)
}
