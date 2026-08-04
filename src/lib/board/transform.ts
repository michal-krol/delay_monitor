import type { RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'

export type BoardRow = {
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
  delayMinutes: number
  status: 'onTime' | 'delayed' | 'cancelled' | 'unknown' | 'notStarted'
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

function computeDelayMinutes(plannedAt: string, actualAt: string | null, apiDelay: number | null): number {
  if (apiDelay !== null) return apiDelay
  if (actualAt === null) return 0
  const plannedMs = new Date(plannedAt).getTime()
  const actualMs = new Date(actualAt).getTime()
  return Math.round((actualMs - plannedMs) / 60000)
}

function computeStatus(
  cancelled: boolean,
  actualAt: string | null,
  delayMinutes: number,
  trainStatus: string | null
): BoardRow['status'] {
  if (cancelled) return 'cancelled'
  if (actualAt === null) return trainStatus === 'S' ? 'notStarted' : 'unknown'
  if (delayMinutes >= 1) return 'delayed'
  return 'onTime'
}

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
function formatPlatform(platform: string | null | undefined, track: string | null | undefined): string | null {
  if (platform && track) return `${platform}/${track}`
  if (platform) return platform
  if (track) return `tor ${track}`
  return null
}

function buildRow(
  trainId: string,
  headsign: string | null,
  plannedAt: string,
  actualAt: string | null,
  cancelled: boolean,
  apiDelay: number | null,
  route: RawRoute | undefined,
  platform: string | null,
  trainStatus: string | null,
  carrierNames: Record<string, string>
): BoardRow {
  const delayMinutes = computeDelayMinutes(plannedAt, actualAt, apiDelay)
  const category = route?.commercialCategorySymbol ?? ''
  const carrier = route?.carrierCode ?? ''
  return {
    trainNumber: trainId,
    trainLabel: computeTrainLabel(route, category, trainId),
    carrier,
    carrierName: carrier ? (carrierNames[carrier] ?? null) : null,
    category,
    headsign,
    plannedAt,
    actualAt,
    delayMinutes,
    status: computeStatus(cancelled, actualAt, delayMinutes, trainStatus),
    platform,
  }
}

function withinWindow(plannedAt: string, now: Date): boolean {
  const plannedMs = new Date(plannedAt).getTime()
  const nowMs = now.getTime()
  return plannedMs >= nowMs - LOOKBACK_WINDOW_MS && plannedMs <= nowMs + VISIBLE_WINDOW_MS
}

function sortAndTrim(rows: BoardRow[], now: Date): BoardRow[] {
  return rows
    .filter((row) => withinWindow(row.plannedAt, now))
    .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime())
    .slice(0, MAX_ROWS)
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
          trainId,
          destination ? resolveStationName(destination.stationId, stationNames) : null,
          stop.plannedDeparture,
          stop.actualDeparture,
          stop.isCancelled,
          stop.departureDelayMinutes,
          route,
          formatPlatform(routeStop?.departurePlatform, routeStop?.departureTrack),
          train.trainStatus,
          carrierNames
        )
      )
    }

    if (stop.plannedArrival !== null) {
      const origin = routeTerminus(route, 'first')
      arrivals.push(
        buildRow(
          trainId,
          origin ? resolveStationName(origin.stationId, stationNames) : null,
          stop.plannedArrival,
          stop.actualArrival,
          stop.isCancelled,
          stop.arrivalDelayMinutes,
          route,
          formatPlatform(routeStop?.arrivalPlatform, routeStop?.arrivalTrack),
          train.trainStatus,
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
