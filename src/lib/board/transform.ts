import type { RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'
import { hasTrainStartedFromStatus, resolveDelayMinutes, resolveStopStatus, type RealizationStatus } from './realization'
import { routeKey } from './routeKey'
import { findPrecedingStationId } from './upstreamEstimate'

export { routeKey } from './routeKey'

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
  /**
   * Szacunek, nie fakt — opóźnienie ze stacji bezpośrednio PRZED tą, o ile
   * jest już potwierdzone. Wyłącznie przy `status === 'enRoute'`, inaczej
   * zawsze `null`. Nigdy nie zastępuje ani nie wpływa na `delayMinutes`
   * (który jest faktem o TYM przystanku) — patrz `upstreamEstimate.ts`.
   */
  estimatedDelayMinutes: number | null
}

export type BoardSnapshot = {
  stationId: string
  stationName: string
  departures: BoardRow[]
  arrivals: BoardRow[]
  fetchedAt: string
}

const VISIBLE_WINDOW_MS = 60 * 60 * 1000
const LOOKBACK_WINDOW_MS = 5 * 60 * 1000
const MAX_ROWS = 10

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

/** „4/2" gdy znane są peron i tor, sam peron albo „tor 2" gdy tylko jedno z nich, `null` gdy nic. */
export function formatPlatform(platform: string | null | undefined, track: string | null | undefined): string | null {
  if (platform && track) return `${platform}/${track}`
  if (platform) return platform
  if (track) return `tor ${track}`
  return null
}

/**
 * Realizacja stacji bezpośrednio przed `stationId` na trasie -- o ile trasa
 * jest dopasowana I ta stacja poprzednia akurat znalazła się w tym samym
 * zapytaniu `/operations` (patrz `poller.ts`, stacje "pomocnicze" dokładane
 * z opóźnieniem jednego cyklu). `undefined`, gdy któregokolwiek z tych
 * warunków brakuje -- wtedy po prostu nie ma z czego liczyć estymaty.
 */
function findUpstreamStop(
  route: RawRoute | undefined,
  stationId: string,
  stops: RawOperationStation[]
): RawOperationStation | undefined {
  const upstreamStationId = findPrecedingStationId(route, stationId)
  if (upstreamStationId === null) return undefined
  return stops.find((stop) => stop.stationId === upstreamStationId)
}

/**
 * Szacunek "prawdopodobnie tyle samo, co na poprzednim przystanku" --
 * wyłącznie gdy TEN przystanek jest jeszcze niepotwierdzony (`enRoute`) i
 * poprzedni jest już potwierdzony i nieodwołany. Odjazdowe opóźnienie
 * pierwsze -- ten sam porządek co `stopDelayMinutes()` w
 * `ConnectionDetails.tsx`: to ono decyduje, czy dalsza podróż rusza planowo.
 */
function estimateDelayFromUpstream(
  status: RealizationStatus,
  upstreamStop: RawOperationStation | undefined
): number | null {
  if (status !== 'enRoute' || !upstreamStop || upstreamStop.isCancelled || !upstreamStop.isConfirmed) return null
  return resolveDelayMinutes(
    upstreamStop.departureDelayMinutes ?? upstreamStop.arrivalDelayMinutes,
    upstreamStop.isConfirmed,
    upstreamStop.plannedDeparture ?? upstreamStop.plannedArrival,
    upstreamStop.actualDeparture ?? upstreamStop.actualArrival
  )
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
  carrierNames: Record<string, string>,
  hasTrainStartedFromTrainStatus: boolean,
  upstreamStop: RawOperationStation | undefined
): BoardRow {
  const delayMinutes = resolveDelayMinutes(apiDelay, isConfirmed, plannedAt, actualAt)
  const category = route?.commercialCategorySymbol ?? ''
  const carrier = route?.carrierCode ?? ''
  // trainStatus bywa `S` nawet dla pociągu jadącego od godzin (inny
  // scheduleId/orderId per odcinek trasy) -- potwierdzony poprzedni
  // przystanek jest silniejszym dowodem "już wyjechał" niż samo trainStatus.
  const upstreamConfirmed = upstreamStop !== undefined && !upstreamStop.isCancelled && upstreamStop.isConfirmed
  const hasTrainStarted = hasTrainStartedFromTrainStatus || upstreamConfirmed
  const status = resolveStopStatus({ isCancelled: cancelled, isConfirmed, delayMinutes, hasTrainStarted })
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
    status,
    platform,
    estimatedDelayMinutes: estimateDelayFromUpstream(status, upstreamStop),
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
 * Przeszłość (do 5 min wstecz) i przyszłość (do 10 połączeń, max 1h w przód)
 * mają osobne budżety, nie jeden wspólny limit — inaczej garstka właśnie
 * minionych połączeń zajmowałaby miejsce należne nadchodzącym w limicie 10.
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
    // Całopociągowy trainStatus przychodzi za darmo w każdej odpowiedzi
    // /operations (patrz realization.ts) -- pozwala pokazać "w trasie" zamiast
    // mylącego "jeszcze nie wyjechał" dla pociągu, który już ruszył gdzieś
    // indziej na trasie, ale jeszcze nie dotarł/nie odjechał z TEJ stacji.
    const hasTrainStarted = hasTrainStartedFromStatus(train.trainStatus)
    // Ta sama stacja poprzednia obsługuje i odjazd, i przyjazd na TEJ stacji
    // -- to jeden i ten sam punkt na trasie, dwa różne zdarzenia w nim.
    const upstreamStop = findUpstreamStop(route, stationId, stops)

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
          carrierNames,
          hasTrainStarted,
          upstreamStop
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
          carrierNames,
          hasTrainStarted,
          upstreamStop
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
