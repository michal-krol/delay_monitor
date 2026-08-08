import type { RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'
import { resolveDelayMinutes, resolveStopStatus, type RealizationStatus } from './realization'

export type BoardRow = {
  /** Klucz do `/api/train` — identyfikuje realizację pociągu, nie wzorzec trasy. */
  scheduleId: string
  orderId: string
  operatingDate: string
  trainNumber: string
  trainLabel: string
  carrier: string
  /** Pełna nazwa przewoźnika ze słownika `dictionaries.carriers` w odpowiedzi `/schedules`, gdy znana. */
  carrierName: string | null
  category: string
  /**
   * Origin (dla przyjazdów) / destination (dla odjazdów) z dopasowanej trasy
   * `/schedules`. `null`, gdy nie ma dopasowanej trasy — `/operations` już nie
   * niesie własnej pełnej trasy (patrz `client.ts`, `fullRoutes`).
   */
  headsign: string | null
  plannedAt: string
  actualAt: string | null
  /** `null`, gdy przystanek nie jest jeszcze potwierdzony (`isConfirmed: false`) — patrz `realization.ts`. */
  delayMinutes: number | null
  status: RealizationStatus
  platform: string | null
}

export type BoardSnapshot = {
  stationId: string
  stationName: string
  departures: BoardRow[]
  arrivals: BoardRow[]
  fetchedAt: string
}

const VISIBLE_WINDOW_MS = 2 * 60 * 60 * 1000
const LOOKBACK_WINDOW_MS = 5 * 60 * 1000
const MAX_ROWS = 20

function computeTrainLabel(route: RawRoute | undefined, category: string, trainId: string): string {
  if (route?.name) return route.name
  if (route?.nationalNumber) return category ? `${category} ${route.nationalNumber}` : route.nationalNumber
  return category ? `${category} ${trainId}` : trainId
}

function findRouteStop(route: RawRoute | undefined, stationId: string): RawRouteStop | undefined {
  return route?.stations.find((stop) => stop.stationId === stationId)
}

/**
 * Pierwszy/ostatni przystanek dopasowanej trasy — źródło „Kierunku".
 * `undefined`, gdy nie ma dopasowanej trasy (routeKey) albo jej lista
 * przystanków jest pusta.
 */
function routeTerminus(route: RawRoute | undefined, end: 'first' | 'last'): RawRouteStop | undefined {
  if (!route || route.stations.length === 0) return undefined
  return end === 'first' ? route.stations[0] : route.stations[route.stations.length - 1]
}

/**
 * Klucz łączący `/operations` z `/schedules`. `orderId` bywa identyfikatorem
 * konkretnego przejazdu w `/operations`, a nie wzorca trasy z `/schedules` —
 * `trainOrderId`, gdy obecny, jest tym wspólnym kluczem po obu stronach
 * (patrz `RawRoute.trainOrderId`). Sam `scheduleId-orderId` gubił trasę dla
 * ok. połowy pociągów w danych produkcyjnych.
 */
export function routeKey(scheduleId: string, orderId: string, trainOrderId: string | null): string {
  return `${scheduleId}-${trainOrderId ?? orderId}`
}

/** „4/2" gdy znane są peron i tor, sam peron albo „tor 2" gdy tylko jedno z nich, `null` gdy nic. */
export function formatPlatform(platform: string | null | undefined, track: string | null | undefined): string | null {
  if (platform && track) return `${platform}/${track}`
  if (platform) return platform
  if (track) return `tor ${track}`
  return null
}

function buildRow(
  scheduleId: string,
  orderId: string,
  operatingDate: string | null,
  trainId: string,
  headsign: string | null,
  plannedAt: string,
  actualAt: string | null,
  cancelled: boolean,
  isConfirmed: boolean,
  apiDelay: number | null,
  route: RawRoute | undefined,
  platform: string | null,
  carrierNames: Record<string, string>
): BoardRow {
  const delayMinutes = resolveDelayMinutes(apiDelay, isConfirmed, plannedAt, actualAt)
  const category = route?.commercialCategorySymbol ?? ''
  const carrier = route?.carrierCode ?? ''
  return {
    scheduleId,
    orderId,
    // Puste, gdy API nie podało operatingDate — /api/train odrzuci taki klucz
    // przy walidacji wejścia, a UI nie pokaże przycisku szczegółów (patrz FullBoard).
    operatingDate: operatingDate ?? '',
    trainNumber: trainId,
    trainLabel: computeTrainLabel(route, category, trainId),
    carrier,
    carrierName: carrier ? (carrierNames[carrier] ?? null) : null,
    category,
    headsign,
    plannedAt,
    actualAt,
    delayMinutes,
    status: resolveStopStatus({ isCancelled: cancelled, isConfirmed, delayMinutes }),
    platform,
  }
}

function isPast(plannedAt: string, now: Date): boolean {
  const plannedMs = new Date(plannedAt).getTime()
  const nowMs = now.getTime()
  return plannedMs < nowMs && plannedMs >= nowMs - LOOKBACK_WINDOW_MS
}

function isUpcoming(plannedAt: string, now: Date): boolean {
  const plannedMs = new Date(plannedAt).getTime()
  const nowMs = now.getTime()
  return plannedMs >= nowMs && plannedMs <= nowMs + VISIBLE_WINDOW_MS
}

function byPlannedAt(a: BoardRow, b: BoardRow): number {
  return new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime()
}

/**
 * Przeszłość (do 5 min wstecz) i przyszłość (do 20 połączeń, max 2h w przód)
 * mają osobne budżety, nie jeden wspólny limit — inaczej garstka właśnie
 * minionych połączeń zajmowałaby miejsce należne nadchodzącym w limicie 20.
 */
function sortAndTrim(rows: BoardRow[], now: Date): BoardRow[] {
  const past = rows.filter((row) => isPast(row.plannedAt, now)).sort(byPlannedAt)
  const upcoming = rows
    .filter((row) => isUpcoming(row.plannedAt, now))
    .sort(byPlannedAt)
    .slice(0, MAX_ROWS)
  return [...past, ...upcoming]
}

function resolveStationName(stationId: string, stationNames: Record<string, string>): string {
  return stationNames[stationId] ?? stationId
}

export function transformOperations(
  stationId: string,
  stationName: string,
  trains: RawTrainOperation[],
  stationNames: Record<string, string>,
  routesByTrainId: Map<string, RawRoute>,
  carrierNames: Record<string, string>,
  fetchedAt: string,
  now: Date = new Date(fetchedAt)
): BoardSnapshot {
  const departures: BoardRow[] = []
  const arrivals: BoardRow[] = []

  for (const train of trains) {
    const stops = train.stations
    const stopIndex = stops.findIndex((stop) => stop.stationId === stationId)
    if (stopIndex === -1) continue

    const stop = stops[stopIndex]
    const trainId = `${train.scheduleId}-${train.orderId}`
    const route = routesByTrainId.get(routeKey(train.scheduleId, train.orderId, train.trainOrderId))
    const routeStop = findRouteStop(route, stationId)

    if (stop.plannedDeparture !== null) {
      const destination = routeTerminus(route, 'last')
      departures.push(
        buildRow(
          train.scheduleId,
          train.orderId,
          train.operatingDate,
          trainId,
          destination ? resolveStationName(destination.stationId, stationNames) : null,
          stop.plannedDeparture,
          stop.actualDeparture,
          stop.isCancelled,
          stop.isConfirmed,
          stop.departureDelayMinutes,
          route,
          formatPlatform(routeStop?.departurePlatform, routeStop?.departureTrack),
          carrierNames
        )
      )
    }

    if (stop.plannedArrival !== null) {
      const origin = routeTerminus(route, 'first')
      arrivals.push(
        buildRow(
          train.scheduleId,
          train.orderId,
          train.operatingDate,
          trainId,
          origin ? resolveStationName(origin.stationId, stationNames) : null,
          stop.plannedArrival,
          stop.actualArrival,
          stop.isCancelled,
          stop.isConfirmed,
          stop.arrivalDelayMinutes,
          route,
          formatPlatform(routeStop?.arrivalPlatform, routeStop?.arrivalTrack),
          carrierNames
        )
      )
    }
  }

  return {
    stationId,
    stationName,
    departures: sortAndTrim(departures, now),
    arrivals: sortAndTrim(arrivals, now),
    fetchedAt,
  }
}
