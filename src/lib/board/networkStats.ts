import type { NameDictionaries, OperationsStatistics, PkpClient } from '../pkp/client'
import { warsawDateString } from '../pkp/time'
import { logEvent } from '@/lib/log'

const STATISTICS_TTL_MS = 15 * 60 * 1000
// Skład rozkładu na dany dzień jest z natury stabilny -- ten sam TTL co
// inne dane rozkładowe w apce (schedulesCache w client.ts), zamiast osobnej
// logiki wyrównania do północy warszawskiej, której tu nie warto budować.
const CARRIER_COUNTS_TTL_MS = 24 * 60 * 60 * 1000
const DISRUPTION_COUNT_TTL_MS = 20 * 60 * 1000
// Po nieudanym sub-requeście nie próbujemy ponownie przez minutę -- inaczej
// każdy kolejny widz strony podczas awarii PKP odpala nowe zapytanie.
const FAILURE_BACKOFF_MS = 60 * 1000
// ~24h historii przy odświeżaniu co 15 min -- tyle, ile potrzeba na sparkline
// "dziś", nie więcej. Jedna replika, ginie przy restarcie (patrz AGENTS.md #5) --
// akceptowalne dla wykresu obejmującego tylko bieżący dzień.
const MAX_HISTORY_POINTS = 100
const TOP_CARRIERS_COUNT = 3

export type NetworkStatsHistoryPoint = {
  at: string
  onTimePct: number
}

export type NetworkStatsCarrier = {
  code: string
  name: string | null
  count: number
}

export type NetworkStatsStatistics = {
  generatedAt: string
  totalTrains: number
  notStarted: number
  inProgress: number
  completed: number
  cancelled: number
  partialCancelled: number
  onTimePct: number | null
}

export type NetworkStats = {
  // Jeden sub-request (`getOperationsStatistics`) -- albo wszystkie te liczniki
  // są znane, albo żaden (patrz AGENTS.md #7 / ui-states.md).
  statistics: NetworkStatsStatistics | null
  topCarriers: NetworkStatsCarrier[]
  disruptionCount: number | null
  history: NetworkStatsHistoryPoint[]
}

/** `null` = nieznany (0 pociągów w rozkładzie na dziś, nie "100% na czas") -- patrz AGENTS.md #7. */
function computeOnTimePct(stats: OperationsStatistics): number | null {
  if (stats.totalTrains === 0) return null
  const cancelledTotal = stats.cancelled + stats.partialCancelled
  return Math.round(((stats.totalTrains - cancelledTotal) / stats.totalTrains) * 1000) / 10
}

/**
 * Stan tego modułu (cache trzech elementów widżetu + historia) — jeden
 * globalny widżet dla wszystkich userów, nie per-stacja jak poller, więc
 * zwykłe `{value, expiresAt, day}` per sub-request zamiast `createTtlCache()`
 * (ten jest kluczowany po wielu wpisach, tu jest dokładnie jeden na sub-request).
 * Trzymamy ostatnią udaną wartość nawet po wygaśnięciu TTL, żeby błąd jednego
 * z trzech podzapytań degradował łagodnie (stare dane + świeże z pozostałych),
 * zamiast czyścić cały widżet — ten sam duch co "UI nigdy nie jest pusty"
 * (AGENTS.md #7), tu bez osobnego snapshotu do pokazania przy pierwszym
 * niepowodzeniu.
 *
 * `day` (warszawska data w chwili pobrania) chroni przed serwowaniem wczorajszej
 * wartości po północy — TTL sam z siebie tego nie gwarantuje (24h cache liczby
 * przewoźników przeżywa północ; nawet 15-minutowy cache statystyk bywa "świeży"
 * tuż po północy). Wartość z innego dnia liczy się jako nieobecna: próbujemy
 * odświeżyć, a przy niepowodzeniu pole raportuje `null`, nie wczorajszą liczbę.
 *
 * `inFlight` dedupuje równoległe wywołania per sub-request (ten sam wzorzec co
 * `inFlight` w `src/app/api/train/route.ts`): rejestrujemy obietnicę PRZED
 * `await`, więc kilku userów odświeżających widżet w tej samej chwili dzielą
 * jedno realne zapytanie do PKP, nie po jednym każdy.
 *
 * `failedAt` to backoff po niepowodzeniu: przez `FAILURE_BACKOFF_MS` nie
 * próbujemy ponownie tego sub-requestu, tylko serwujemy ostatnią dobrą wartość
 * z tego samego dnia (albo `null`, gdy jej nie ma) — inaczej seria requestów w
 * trakcie awarii PKP odpalałaby nowe zapytanie za każdym razem.
 */
type CachedValue<T> = { value: T; expiresAt: number; day: string }
type SlotState<T> = {
  cached: CachedValue<T> | null
  inFlight: Promise<T> | null
  failedAt: number | null
}

function makeSlotState<T>(): SlotState<T> {
  return { cached: null, inFlight: null, failedAt: null }
}

let statisticsState = makeSlotState<OperationsStatistics>()
let carrierCountsState = makeSlotState<Record<string, number>>()
let disruptionCountState = makeSlotState<number>()
const history: NetworkStatsHistoryPoint[] = []
let historyDay: string | null = null

/**
 * Pobiera i cache'uje jeden sub-request, z dedupem równoległych wywołań,
 * backoffem po niepowodzeniu i kluczowaniem po dniu warszawskim (patrz
 * komentarz przy `CachedValue`/`SlotState` wyżej).
 *
 * `onFreshValue` odpala się dokładnie raz na realne pobranie (wewnątrz
 * współdzielonej obietnicy `inFlight`), nie raz na każde wywołanie tej
 * funkcji — inaczej dwóch równoległych callerów dopisałoby dwa punkty
 * historii za jedno prawdziwe odświeżenie.
 */
async function getOrRefresh<T>(
  state: SlotState<T>,
  today: string,
  ttlMs: number,
  load: () => Promise<T>,
  onError: (err: unknown) => void,
  onFreshValue?: (value: T) => void
): Promise<T | null> {
  const cached = state.cached
  const sameDayValue = cached !== null && cached.day === today ? cached.value : null

  if (cached !== null && cached.day === today && cached.expiresAt > Date.now()) {
    return cached.value
  }

  if (state.failedAt !== null && Date.now() - state.failedAt < FAILURE_BACKOFF_MS) {
    return sameDayValue
  }

  if (state.inFlight === null) {
    state.inFlight = load()
      .then((value) => {
        state.cached = { value, expiresAt: Date.now() + ttlMs, day: today }
        state.failedAt = null
        onFreshValue?.(value)
        return value
      })
      .catch((err: unknown) => {
        onError(err)
        state.failedAt = Date.now()
        throw err
      })
      .finally(() => {
        state.inFlight = null
      })
  }

  try {
    return await state.inFlight
  } catch {
    return sameDayValue
  }
}

export async function getNetworkStats(client: PkpClient, now: () => Date = () => new Date()): Promise<NetworkStats> {
  const today = warsawDateString(now())
  // Nowy dzień warszawski -- sparkline zaczyna od zera, wczorajsze punkty nie
  // mają tu czego robić.
  if (historyDay !== null && historyDay !== today) {
    history.length = 0
  }
  historyDay = today

  const [stats, carrierCounts, disruptionCount] = await Promise.all([
    getOrRefresh(
      statisticsState,
      today,
      STATISTICS_TTL_MS,
      () => client.getOperationsStatistics(today),
      (err) => logEvent('error', 'network_stats.statistics_failed', {}, err),
      (value) => {
        const onTimePct = computeOnTimePct(value)
        // Nieznany % (0 pociągów) nie trafia do historii -- nie ma czego rysować na sparklinie.
        if (onTimePct !== null) {
          history.push({ at: value.generatedAt, onTimePct })
          while (history.length > MAX_HISTORY_POINTS) history.shift()
        }
      }
    ),
    getOrRefresh(
      carrierCountsState,
      today,
      CARRIER_COUNTS_TTL_MS,
      () => client.getDailyCarrierCounts(today),
      (err) => logEvent('error', 'network_stats.carrier_counts_failed', {}, err)
    ),
    getOrRefresh(
      disruptionCountState,
      today,
      DISRUPTION_COUNT_TTL_MS,
      () => client.getDisruptionCount(today, today),
      (err) => logEvent('error', 'network_stats.disruption_count_failed', {}, err)
    ),
  ])

  const carrierCountsValue = carrierCounts ?? {}

  let topCarriers: NetworkStatsCarrier[] = []
  if (Object.keys(carrierCountsValue).length > 0) {
    const names = await client.getNameDictionaries().catch((): NameDictionaries => ({ carrierNames: {}, categoryNames: {} }))
    topCarriers = Object.entries(carrierCountsValue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_CARRIERS_COUNT)
      .map(([code, count]) => ({ code, name: names.carrierNames[code] ?? null, count }))
  }

  return {
    statistics: stats
      ? {
          generatedAt: stats.generatedAt,
          totalTrains: stats.totalTrains,
          notStarted: stats.notStarted,
          inProgress: stats.inProgress,
          completed: stats.completed,
          cancelled: stats.cancelled,
          partialCancelled: stats.partialCancelled,
          onTimePct: computeOnTimePct(stats),
        }
      : null,
    topCarriers,
    disruptionCount,
    history: [...history],
  }
}

/** Wyłącznie do testów — resetuje moduł między przypadkami (ten sam wzorzec co inne moduły ze stanem na poziomie modułu w tej bazie kodu). */
export function resetNetworkStatsForTests(): void {
  statisticsState = makeSlotState()
  carrierCountsState = makeSlotState()
  disruptionCountState = makeSlotState()
  history.length = 0
  historyDay = null
}
