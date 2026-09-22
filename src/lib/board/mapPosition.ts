import {
  isScheduleProjection,
  isStalePositionProjection,
  resolveCurrentStopIndex,
  resolveProjectedStopIndex,
  resolveScheduledStopIndex,
  type TrainDetailStop,
} from './trainDetail'

/** `TrainDetailStop` plus statyczne współrzędne stacji, doklejone przy `/api/train` (patrz `src/app/api/train/coordinates.ts`) -- `null` = brak użytecznych danych dla tej stacji. */
export type TrainDetailStopWithCoords = TrainDetailStop & { lat: number | null; lon: number | null }

function nextNonCancelledIndex(stops: TrainDetailStopWithCoords[], fromExclusive: number): number {
  for (let i = fromExclusive + 1; i < stops.length; i += 1) {
    if (!stops[i].isCancelled) return i
  }
  return -1
}

/**
 * Pozycja pociągu na mapie, interpolowana w czasie między dwoma sąsiednimi
 * przystankami -- ZAWSZE szacowana, wołający ma pokazać ją z etykietą
 * „szacowane wg rozkładu" bez wyjątków (AGENTS.md #7). `null`, gdy nie ma
 * czego pokazać: pociąg jeszcze nie wyjechał, brak współrzędnych na kotwicy
 * albo następniku, albo pusta lista przystanków.
 *
 * Kotwica = ten sam indeks, którego już używa oś w `ConnectionDetails.tsx`
 * (`isScheduleProjection`/`isStalePositionProjection` decydują który
 * resolwer), więc marker na mapie i „Pociąg jest tutaj" w osi nigdy się nie
 * rozjeżdżają. Opóźnienie doklejane do przedziału czasu bierze się zawsze
 * z OSTATNIEGO POTWIERDZONEGO przystanku (`resolveCurrentStopIndex`), nie
 * z samej kotwicy interpolacji -- w trybie „stale" kotwica jest projekcją
 * rozkładową dalej na trasie i jej własne pola opóźnienia są `null`
 * (niepotwierdzona), więc czytanie ich dałoby przesunięcie 0 zamiast realnego.
 */
export function resolveInterpolatedPosition(
  stops: TrainDetailStopWithCoords[],
  trainStatus: string | null,
  now: Date
): { lat: number; lon: number } | null {
  if (stops.length === 0) return null

  const scheduleMode = isScheduleProjection(stops, trainStatus, now)
  const staleProjection = !scheduleMode && isStalePositionProjection(stops, trainStatus, now)
  const anchorIndex = scheduleMode
    ? resolveScheduledStopIndex(stops, now)
    : staleProjection
      ? resolveProjectedStopIndex(stops, now)
      : resolveCurrentStopIndex(stops)

  if (anchorIndex < 0 || stops[anchorIndex].isCancelled) return null

  const confirmedAnchorIndex = resolveCurrentStopIndex(stops)
  const delayMs =
    confirmedAnchorIndex >= 0
      ? (stops[confirmedAnchorIndex].departureDelayMinutes ?? stops[confirmedAnchorIndex].arrivalDelayMinutes ?? 0) * 60_000
      : 0

  const anchorStop = stops[anchorIndex]
  const nextIndex = nextNonCancelledIndex(stops, anchorIndex)

  if (nextIndex < 0) {
    return anchorStop.lat === null || anchorStop.lon === null ? null : { lat: anchorStop.lat, lon: anchorStop.lon }
  }

  const nextStop = stops[nextIndex]
  if (anchorStop.lat === null || anchorStop.lon === null || nextStop.lat === null || nextStop.lon === null) return null

  const startAt = anchorStop.plannedDeparture ?? anchorStop.plannedArrival
  const endAt = nextStop.plannedArrival ?? nextStop.plannedDeparture
  if (startAt === null || endAt === null) return { lat: anchorStop.lat, lon: anchorStop.lon }

  const startMs = new Date(startAt).getTime() + delayMs
  const endMs = new Date(endAt).getTime() + delayMs
  if (endMs <= startMs) return { lat: anchorStop.lat, lon: anchorStop.lon }

  const fraction = Math.min(1, Math.max(0, (now.getTime() - startMs) / (endMs - startMs)))
  return {
    lat: anchorStop.lat + (nextStop.lat - anchorStop.lat) * fraction,
    lon: anchorStop.lon + (nextStop.lon - anchorStop.lon) * fraction,
  }
}
