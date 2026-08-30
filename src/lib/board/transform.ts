import type { RawOperationStation, RawRoute, RawRouteStop, RawTrainOperation } from '../pkp/types'
import { hasTrainStartedFromStatus, resolveDelayMinutes, resolvePredictedTime, resolveStopStatus, type RealizationStatus } from './realization'
import { disruptionTrainKey } from './disruptions'
import { findRouteForTrain } from './routeKey'
import { findPrecedingStationIds, UPSTREAM_LOOKBACK_HOPS } from './upstreamEstimate'
import { DEFAULT_PUNCTUALITY_THRESHOLD_MINUTES, type StationInsights, type StationStats } from './stationStats'

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
  /** Pełna nazwa kategorii handlowej ze słownika `dictionaries.commercialCategories` w odpowiedzi `/schedules`, gdy znana — sam wzorzec co `carrierName` wyżej. */
  categoryName: string | null
  /**
   * Origin (dla przyjazdów) / destination (dla odjazdów) z dopasowanej trasy
   * `/schedules`. `null`, gdy nie ma dopasowanej trasy — `/operations` już nie
   * niesie własnej pełnej trasy (patrz `client.ts`, `fullRoutes`).
   */
  headsign: string | null
  /**
   * Wybrane przystanki pośrednie między TĄ stacją a `headsign` (dla odjazdów;
   * dla przyjazdów — przebyte przed tą stacją, w kolejności jazdy). Do
   * `MAX_VIA_STOPS` nazw; `[]` gdy nie ma dopasowanej trasy albo pociąg jedzie
   * stąd prosto do celu. Zero dodatkowych zapytań — trasa jest już w cache'u
   * `/schedules` pollera (patrz `poller.ts`).
   */
  via: string[]
  /** Ile przystanków pośrednich NIE zmieściło się w `via` — „· +12 przystanków". `0` gdy wszystkie się zmieściły. */
  viaRemaining: number
  plannedAt: string
  /** FAKT — `null`, dopóki przystanek nie jest potwierdzony. Patrz `realization.ts`. */
  actualAt: string | null
  /** PROGNOZA — przewidywana godzina dla niepotwierdzonego przystanku. Nigdy nie jest faktem i nigdy nie nadpisuje `actualAt`; patrz `resolvePredictedTime()`. */
  predictedAt: string | null
  /** `null`, gdy przystanek nie jest jeszcze potwierdzony (`isConfirmed: false`) — patrz `realization.ts`. */
  delayMinutes: number | null
  status: RealizationStatus
  /** Peron PLANOWY — API nie reprezentuje zmiany peronu w ostatniej chwili (patrz `routeStopPlatform`). `null` = nie podano. */
  platform: string | null
  /** Tor PLANOWY, niezależnie od `platform` — jedno bywa znane bez drugiego. Formatowanie („2 / —") należy do UI, nie tutaj. */
  track: string | null
  /**
   * Szacunek, nie fakt — opóźnienie ze stacji bezpośrednio PRZED tą, o ile
   * jest już potwierdzone. Wyłącznie przy `status === 'enRoute'`, inaczej
   * zawsze `null`. Nigdy nie zastępuje ani nie wpływa na `delayMinutes`
   * (który jest faktem o TYM przystanku) — patrz `upstreamEstimate.ts`.
   */
  estimatedDelayMinutes: number | null
  /** Czy CAŁY przejazd (dowolna stacja trasy) jest objęty utrudnieniem -- patrz `board/disruptions.ts`. Samo flagowanie, treść dopiero w panelu szczegółów (`/api/train`). */
  hasDisruption: boolean
}

export type BoardSnapshot = {
  stationId: string
  stationName: string
  departures: BoardRow[]
  arrivals: BoardRow[]
  fetchedAt: string
  /**
   * Kafelki KPI i kontekst prawej kolumny. Liczone w cyklu pollera z danych,
   * które ten cykl i tak ma (patrz `stationStats.ts`) — nie kosztują ani
   * jednego dodatkowego zapytania do PKP.
   */
  stats: StationStats
  insights: StationInsights
  /**
   * Zdekodowane treści utrudnień dotykających TEJ stacji — dowolnego
   * przejazdu przez nią (patrz `findStationDisruptionMessages`). Pusta
   * tablica = brak zgłoszonych utrudnień; awaria pobrania degraduje do tego
   * samego pustego stanu, tak jak `hasDisruption` na wierszach.
   */
  disruptionMessages: string[]
}

/**
 * Okno widoczności tablicy. Szersze niż wyświetla domyślnie UI (patrz
 * „Pokaż więcej połączeń" w `BoardTable.tsx`) — `/operations` i tak zwraca
 * CAŁY dzień, więc poszerzenie kosztuje wyłącznie rozmiar snapshotu, ani
 * jednego dodatkowego zapytania do PKP. Widoki pokazujące mniej (kafelki
 * ulubionych) tną listę po swojej stronie.
 */
const VISIBLE_WINDOW_MS = 3 * 60 * 60 * 1000
const LOOKBACK_WINDOW_MS = 5 * 60 * 1000
const MAX_ROWS = 40

/** Ile przystanków pośrednich wchodzi do `BoardRow.via`; reszta ląduje w `viaRemaining`. */
const MAX_VIA_STOPS = 3

function computeTrainLabel(route: RawRoute | undefined, category: string, trainId: string): string {
  if (route?.name) return route.name
  if (route?.nationalNumber) return category ? `${category} ${route.nationalNumber}` : route.nationalNumber
  return category ? `${category} ${trainId}` : trainId
}

/** Współdzielone z `trainDetail.ts` -- oba szukają tego samego przystanku na trasie rozkładowej. */
export function findRouteStop(route: RawRoute | null | undefined, stationId: string): RawRouteStop | undefined {
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
 * Przystanki pośrednie między TĄ stacją a końcem trasy — „przez Pruszków,
 * Opoczno, Kielce · +12 przystanków" z makiety §9.
 *
 * Dla odjazdów bierzemy odcinek ZA tą stacją (kierunek jazdy), dla przyjazdów
 * odcinek PRZED nią, wciąż w kolejności jazdy — pasażer czyta trasę tak, jak
 * pociąg ją pokonuje, niezależnie od tego, którą tablicę ogląda. Terminus jest
 * wyłączony, bo pokazujemy go osobno jako `headsign`.
 *
 * `{ via: [], viaRemaining: 0 }` gdy nie ma dopasowanej trasy — pusta lista
 * znaczy „nie wiemy" i UI pokazuje wtedy sam kierunek, zamiast zgadywać.
 */
function collectVia(
  route: RawRoute | undefined,
  stationId: string,
  direction: 'departure' | 'arrival',
  stationNames: Record<string, string>
): { via: string[]; viaRemaining: number } {
  if (!route) return { via: [], viaRemaining: 0 }
  const index = route.stations.findIndex((stop) => stop.stationId === stationId)
  if (index === -1) return { via: [], viaRemaining: 0 }

  // Odcinek BEZ terminusa (pokazywanego jako `headsign`) i bez tej stacji.
  const segment = direction === 'departure' ? route.stations.slice(index + 1, -1) : route.stations.slice(1, index)

  return {
    via: segment.slice(0, MAX_VIA_STOPS).map((stop) => resolveStationName(stop.stationId, stationNames)),
    viaRemaining: Math.max(0, segment.length - MAX_VIA_STOPS),
  }
}

/** Peron i tor jako osobne wartości — sklejanie w „2 / 4" należy do UI (makieta §10 rozróżnia `2 / 4`, `2 / —` i „nie podano"). */
export type PlatformTrack = { platform: string | null; track: string | null }

function pickPlatform(platform: string | null | undefined, track: string | null | undefined): PlatformTrack {
  return { platform: platform ?? null, track: track ?? null }
}

/**
 * Peron/tor dla jednego zdarzenia (przyjazd albo odjazd) na przystanku trasy,
 * z fallbackiem na drugą stronę. PKP wypełnia w `/schedules` zwykle tylko
 * `departurePlatform`/`departureTrack` dla przystanków przelotowych, a
 * `arrivalPlatform`/`arrivalTrack` zostawia `null` poza stacją końcową — bez
 * fallbacku tablica Przyjazdów pokazywałaby „—" dla niemal każdego pociągu.
 * Na przystanku przelotowym to fizycznie ten sam peron; ta sama decyzja co
 * w panelu szczegółów połączenia (patrz `trainDetail.ts`).
 */
export function routeStopPlatform(routeStop: RawRouteStop | undefined, prefer: 'arrival' | 'departure'): PlatformTrack {
  if (prefer === 'arrival') {
    return pickPlatform(
      routeStop?.arrivalPlatform ?? routeStop?.departurePlatform,
      routeStop?.arrivalTrack ?? routeStop?.departureTrack
    )
  }
  return pickPlatform(
    routeStop?.departurePlatform ?? routeStop?.arrivalPlatform,
    routeStop?.departureTrack ?? routeStop?.arrivalTrack
  )
}

/**
 * Realizacje do `UPSTREAM_LOOKBACK_HOPS` stacji przed `stationId` na trasie,
 * od najbliższej -- ograniczone do tych, które akurat znalazły się w tym
 * samym zapytaniu `/operations` (patrz `poller.ts`, stacje "pomocnicze"
 * dokładane z opóźnieniem jednego cyklu). Pusta lista, gdy nie ma
 * dopasowanej trasy albo żadna z nich nie została dociągnięta -- wtedy po
 * prostu nie ma z czego liczyć estymaty.
 */
function findUpstreamStops(
  route: RawRoute | undefined,
  stationId: string,
  stops: RawOperationStation[]
): RawOperationStation[] {
  return findPrecedingStationIds(route, stationId, UPSTREAM_LOOKBACK_HOPS)
    .map((id) => stops.find((stop) => stop.stationId === id))
    .filter((stop): stop is RawOperationStation => stop !== undefined)
}

function isUsableUpstream(stop: RawOperationStation): boolean {
  return !stop.isCancelled && stop.isConfirmed
}

/**
 * Szacunek "prawdopodobnie tyle samo, co na niedawnym przystanku" --
 * wyłącznie gdy TEN przystanek jest jeszcze niepotwierdzony (`enRoute`),
 * liczony z NAJBLIŻSZEGO potwierdzonego i nieodwołanego przystanku wstecz
 * (pierwszego trafienia w `upstreamStops`, które jest już posortowane od
 * najbliższego). Odjazdowe opóźnienie pierwsze -- ten sam porządek co
 * `stopDelayMinutes()` w `ConnectionDetails.tsx`: to ono decyduje, czy
 * dalsza podróż rusza planowo.
 */
function estimateDelayFromUpstream(status: RealizationStatus, upstreamStops: RawOperationStation[]): number | null {
  if (status !== 'enRoute') return null
  const upstreamStop = upstreamStops.find(isUsableUpstream)
  if (!upstreamStop) return null
  return resolveDelayMinutes(
    upstreamStop.departureDelayMinutes ?? upstreamStop.arrivalDelayMinutes,
    upstreamStop.isConfirmed,
    upstreamStop.plannedDeparture ?? upstreamStop.plannedArrival,
    upstreamStop.actualDeparture ?? upstreamStop.actualArrival
  )
}

/** Kontekst wspólny dla obu kierunków (przyjazd/odjazd) TEGO SAMEGO przystanku -- identyczny w obu wywołaniach `buildRow` w `transformOperations`. */
type TrainStopContext = {
  scheduleId: string
  orderId: string
  operatingDate: string | null
  trainId: string
  cancelled: boolean
  isConfirmed: boolean
  route: RawRoute | undefined
  carrierNames: Record<string, string>
  categoryNames: Record<string, string>
  hasTrainStartedFromTrainStatus: boolean
  upstreamStops: RawOperationStation[]
  hasDisruption: boolean
}

/** To, co faktycznie różni się między przyjazdem a odjazdem TEGO SAMEGO przystanku. */
type DirectionInput = {
  headsign: string | null
  via: string[]
  viaRemaining: number
  plannedAt: string
  actualAt: string | null
  apiDelay: number | null
  platformTrack: PlatformTrack
}

function buildRow(context: TrainStopContext, direction: DirectionInput): BoardRow {
  const { scheduleId, orderId, operatingDate, trainId, cancelled, isConfirmed, route, carrierNames, categoryNames, hasTrainStartedFromTrainStatus, upstreamStops, hasDisruption } = context
  const { headsign, via, viaRemaining, plannedAt, actualAt, apiDelay, platformTrack } = direction

  const delayMinutes = resolveDelayMinutes(apiDelay, isConfirmed, plannedAt, actualAt)
  const category = route?.commercialCategorySymbol ?? ''
  const carrier = route?.carrierCode ?? ''
  // trainStatus bywa `S` nawet dla pociągu jadącego od godzin (inny
  // scheduleId/orderId per odcinek trasy, albo po prostu spóźnione
  // potwierdzenie na gęstej linii) -- którykolwiek z niedawnych przystanków
  // potwierdzony jest silniejszym dowodem "już wyjechał" niż samo trainStatus.
  const hasTrainStarted = hasTrainStartedFromTrainStatus || upstreamStops.some(isUsableUpstream)
  // Bez `plannedAt`/`now` (opcjonalne w `resolveStopStatus`, dla „plan dawno
  // minął → brak danych"): `sortAndTrim` i tak trzyma tu tylko wiersze do
  // `LOOKBACK_WINDOW_MS` (5 min) wstecz, więc ta gałąź jest nieosiągalna z tablicy.
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
    categoryName: category ? (categoryNames[category] ?? null) : null,
    headsign,
    via,
    viaRemaining,
    plannedAt,
    actualAt,
    // PROGNOZA obok FAKTU, nigdy zamiast niego — ta sama funkcja co w panelu
    // szczegółów połączenia (`trainDetail.ts`), jedna implementacja.
    predictedAt: resolvePredictedTime(plannedAt, actualAt, isConfirmed),
    delayMinutes,
    status,
    platform: platformTrack.platform,
    track: platformTrack.track,
    estimatedDelayMinutes: estimateDelayFromUpstream(status, upstreamStops),
    hasDisruption,
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
  now: Date = new Date(fetchedAt),
  // Ostatni, opcjonalny parametr (nie obok carrierNames) świadomie -- ten sam
  // wzorzec słownika co carrierNames, ale dodany później, żeby nie przestawiać
  // pozycji fetchedAt/now w kilkudziesięciu miejscach w transform.test.ts.
  categoryNames: Record<string, string> = {},
  /** Klucze `disruptionTrainKey()` pociągów dotkniętych utrudnieniem -- ten sam trailing-optional wzorzec co `categoryNames` wyżej. */
  disruptedTrains: ReadonlySet<string> = new Set(),
  /**
   * Policzone przez `computeStationStats()` w cyklu pollera i wstrzyknięte
   * tutaj, zamiast liczone w środku -- ta funkcja jest per-stacja, a wejście
   * do statystyk (cały dzień realizacji + trasy) jest wspólne dla całego
   * cyklu. Domyślnie „nic nie wiadomo", żeby testy tablicy nie musiały
   * podawać statystyk, które ich nie dotyczą.
   */
  stationStats: { stats: StationStats; insights: StationInsights } = {
    stats: {
      departuresToday: null,
      arrivalsToday: null,
      averageDelayMinutes: null,
      averageDelaySample: 0,
      punctualityPct: null,
      punctualitySample: 0,
      punctualityThresholdMinutes: DEFAULT_PUNCTUALITY_THRESHOLD_MINUTES,
    },
    insights: { topDestinations: [], hourlyTraffic: null },
  },
  /** Patrz `BoardSnapshot.disruptionMessages`. */
  disruptionMessages: string[] = []
): BoardSnapshot {
  const departures: BoardRow[] = []
  const arrivals: BoardRow[] = []

  for (const train of trains) {
    const stops = train.stations
    const stopIndex = stops.findIndex((stop) => stop.stationId === stationId)
    if (stopIndex === -1) continue

    const stop = stops[stopIndex]
    const trainId = `${train.scheduleId}-${train.orderId}`
    // Wariant trasy z DNIA tego przejazdu, nie „jakikolwiek o tym kluczu" --
    // patrz `findRouteForTrain()`; peron i przystanki potrafią się między
    // dniami różnić.
    const route = findRouteForTrain(routesByTrainId, train)
    const routeStop = findRouteStop(route, stationId)
    // Całopociągowy trainStatus przychodzi za darmo w każdej odpowiedzi
    // /operations (patrz realization.ts) -- pozwala pokazać "w trasie" zamiast
    // mylącego "jeszcze nie wyjechał" dla pociągu, który już ruszył gdzieś
    // indziej na trasie, ale jeszcze nie dotarł/nie odjechał z TEJ stacji.
    const hasTrainStarted = hasTrainStartedFromStatus(train.trainStatus)
    // Ta sama stacja poprzednia obsługuje i odjazd, i przyjazd na TEJ stacji
    // -- to jeden i ten sam punkt na trasie, dwa różne zdarzenia w nim.
    const upstreamStops = findUpstreamStops(route, stationId, stops)
    const hasDisruption = train.operatingDate !== null && disruptedTrains.has(disruptionTrainKey(train.scheduleId, train.orderId, train.operatingDate))
    const context: TrainStopContext = {
      scheduleId: train.scheduleId,
      orderId: train.orderId,
      operatingDate: train.operatingDate,
      trainId,
      cancelled: stop.isCancelled,
      isConfirmed: stop.isConfirmed,
      route,
      carrierNames,
      categoryNames,
      hasTrainStartedFromTrainStatus: hasTrainStarted,
      upstreamStops,
      hasDisruption,
    }

    if (stop.plannedDeparture !== null) {
      const destination = routeTerminus(route, 'last')
      departures.push(
        buildRow(context, {
          headsign: destination ? resolveStationName(destination.stationId, stationNames) : null,
          ...collectVia(route, stationId, 'departure', stationNames),
          plannedAt: stop.plannedDeparture,
          actualAt: stop.actualDeparture,
          apiDelay: stop.departureDelayMinutes,
          platformTrack: routeStopPlatform(routeStop, 'departure'),
        })
      )
    }

    if (stop.plannedArrival !== null) {
      const origin = routeTerminus(route, 'first')
      arrivals.push(
        buildRow(context, {
          headsign: origin ? resolveStationName(origin.stationId, stationNames) : null,
          ...collectVia(route, stationId, 'arrival', stationNames),
          plannedAt: stop.plannedArrival,
          actualAt: stop.actualArrival,
          apiDelay: stop.arrivalDelayMinutes,
          platformTrack: routeStopPlatform(routeStop, 'arrival'),
        })
      )
    }
  }

  return {
    stationId,
    stationName,
    departures: sortAndTrim(departures, now),
    arrivals: sortAndTrim(arrivals, now),
    fetchedAt,
    stats: stationStats.stats,
    insights: stationStats.insights,
    disruptionMessages,
  }
}
