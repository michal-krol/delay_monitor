import type { GtfsSchedule } from './types'
import type { VehiclePosition } from './vehicles'

export type VehicleOnRoute = {
  sideNumber: string
  tripId: string
  routeId: string
  directionId: number
  /** Indeks przystanka w przebiegu, ZA którym jest pojazd (0 .. stops.length-2). */
  afterStopOrder: number
  /** Postęp na odcinku [afterStopOrder, +1], 0..1. */
  fraction: number
  ageSec: number
  headsign: string | null
  bearing: number | null
}

const MAX_OFF_ROUTE_M = 2000
const M_PER_DEG = 111_320

/** Rzut punktu P na odcinek AB (przybliżenie równopromienne); dystans w metrach i parametr t∈[0,1]. */
function projectOnSegment(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number
): { distanceM: number; t: number } {
  const cos = Math.cos((aLat * Math.PI) / 180)
  const ax = 0, ay = 0
  const bx = (bLon - aLon) * M_PER_DEG * cos
  const by = (bLat - aLat) * M_PER_DEG
  const px = (pLon - aLon) * M_PER_DEG * cos
  const py = (pLat - aLat) * M_PER_DEG
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx, cy = ay + t * dy
  return { distanceM: Math.hypot(px - cx, py - cy), t }
}

/**
 * Czysty rzut pozycji pojazdu na sekwencję przystanków jego linii. Bez opóźnienia —
 * wynik niesie tylko `afterStopOrder` + `fraction` + `ageSec`. `null`, gdy: nieznany
 * `tripId`, brak przebiegu, przebieg < 2 przystanki, najbliższy punkt > 2000 m od trasy.
 */
export function projectVehicle(
  schedule: GtfsSchedule,
  position: VehiclePosition,
  nowMs: number
): VehicleOnRoute | null {
  const ref = schedule.tripPatternRef.get(position.tripId)
  if (ref === undefined) return null

  const pattern = schedule.routePatterns.get(`${ref.routeIdx}:${ref.direction}`)
  if (pattern === undefined || pattern.stops.length < 2) return null

  let best: { order: number; t: number; d: number } | null = null
  for (let i = 0; i < pattern.stops.length - 1; i += 1) {
    const a = pattern.stops[i]
    const b = pattern.stops[i + 1]
    const r = projectOnSegment(
      position.lat, position.lon,
      schedule.stopLat[a], schedule.stopLon[a],
      schedule.stopLat[b], schedule.stopLon[b]
    )
    if (best === null || r.distanceM < best.d) best = { order: i, t: r.t, d: r.distanceM }
  }
  if (best === null || best.d > MAX_OFF_ROUTE_M) return null

  const route = schedule.routes[ref.routeIdx]
  const parsed = Date.parse(position.timestamp)
  const ageSec = Number.isFinite(parsed) ? Math.max(0, Math.floor((nowMs - parsed) / 1000)) : 0

  return {
    sideNumber: position.sideNumber,
    tripId: position.tripId,
    routeId: route?.id ?? '',
    directionId: ref.direction,
    afterStopOrder: best.order,
    fraction: best.t,
    ageSec,
    headsign: pattern.headsignIdx >= 0 ? schedule.headsigns[pattern.headsignIdx] : null,
    bearing: position.bearing,
  }
}
