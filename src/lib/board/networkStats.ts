import type { NameDictionaries, OperationsStatistics, PkpClient } from '../pkp/client'
import { warsawDateString } from '../pkp/time'
import { logEvent } from '@/lib/log'

const STATISTICS_TTL_MS = 15 * 60 * 1000
// Skład rozkładu na dany dzień jest z natury stabilny -- ten sam TTL co
// inne dane rozkładowe w apce (schedulesCache w client.ts), zamiast osobnej
// logiki wyrównania do północy warszawskiej, której tu nie warto budować.
const CARRIER_COUNTS_TTL_MS = 24 * 60 * 60 * 1000
const DISRUPTION_COUNT_TTL_MS = 20 * 60 * 1000
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
 * zwykłe `{value, expiresAt}` zamiast `createTtlCache()` (ten jest kluczowany
 * po wielu wpisach, tu jest dokładnie jeden). Trzymamy ostatnią udaną wartość
 * nawet po wygaśnięciu TTL, żeby błąd jednego z trzech podzapytań degradował
 * łagodnie (stare dane + świeże z pozostałych), zamiast czyścić cały widżet —
 * ten sam duch co "UI nigdy nie jest pusty" (AGENTS.md #7), tu bez osobnego
 * snapshotu do pokazania przy pierwszym niepowodzeniu.
 */
type CachedValue<T> = { value: T; expiresAt: number }

let statisticsCache: CachedValue<OperationsStatistics> | null = null
let carrierCountsCache: CachedValue<Record<string, number>> | null = null
let disruptionCountCache: CachedValue<number> | null = null
const history: NetworkStatsHistoryPoint[] = []

async function refreshIfStale<T>(
  cached: CachedValue<T> | null,
  ttlMs: number,
  load: () => Promise<T>,
  onError: (err: unknown) => void
): Promise<{ value: T | null; refreshed: boolean }> {
  if (cached !== null && cached.expiresAt > Date.now()) {
    return { value: cached.value, refreshed: false }
  }
  try {
    const value = await load()
    return { value, refreshed: true }
  } catch (err) {
    onError(err)
    // Wygasłe, ale ostatnie znane dane są lepsze niż nic (patrz komentarz wyżej).
    return { value: cached?.value ?? null, refreshed: false }
  }
}

export async function getNetworkStats(client: PkpClient, now: () => Date = () => new Date()): Promise<NetworkStats> {
  const today = warsawDateString(now())

  const [statisticsResult, carrierCountsResult, disruptionCountResult] = await Promise.all([
    refreshIfStale(
      statisticsCache,
      STATISTICS_TTL_MS,
      () => client.getOperationsStatistics(today),
      (err) => logEvent('error', 'network_stats.statistics_failed', {}, err)
    ),
    refreshIfStale(
      carrierCountsCache,
      CARRIER_COUNTS_TTL_MS,
      () => client.getDailyCarrierCounts(today),
      (err) => logEvent('error', 'network_stats.carrier_counts_failed', {}, err)
    ),
    refreshIfStale(
      disruptionCountCache,
      DISRUPTION_COUNT_TTL_MS,
      () => client.getDisruptionCount(today, today),
      (err) => logEvent('error', 'network_stats.disruption_count_failed', {}, err)
    ),
  ])

  if (statisticsResult.refreshed && statisticsResult.value !== null) {
    statisticsCache = { value: statisticsResult.value, expiresAt: Date.now() + STATISTICS_TTL_MS }
    const onTimePct = computeOnTimePct(statisticsResult.value)
    // Nieznany % (0 pociągów) nie trafia do historii -- nie ma czego rysować na sparklinie.
    if (onTimePct !== null) {
      history.push({ at: statisticsResult.value.generatedAt, onTimePct })
      while (history.length > MAX_HISTORY_POINTS) history.shift()
    }
  }
  if (carrierCountsResult.refreshed && carrierCountsResult.value !== null) {
    carrierCountsCache = { value: carrierCountsResult.value, expiresAt: Date.now() + CARRIER_COUNTS_TTL_MS }
  }
  if (disruptionCountResult.refreshed && disruptionCountResult.value !== null) {
    disruptionCountCache = { value: disruptionCountResult.value, expiresAt: Date.now() + DISRUPTION_COUNT_TTL_MS }
  }

  const stats = statisticsResult.value
  const carrierCounts = carrierCountsResult.value ?? {}

  let topCarriers: NetworkStatsCarrier[] = []
  if (Object.keys(carrierCounts).length > 0) {
    const names = await client.getNameDictionaries().catch((): NameDictionaries => ({ carrierNames: {}, categoryNames: {} }))
    topCarriers = Object.entries(carrierCounts)
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
    disruptionCount: disruptionCountResult.value,
    history: [...history],
  }
}

/** Wyłącznie do testów — resetuje moduł między przypadkami (ten sam wzorzec co inne moduły ze stanem na poziomie modułu w tej bazie kodu). */
export function resetNetworkStatsForTests(): void {
  statisticsCache = null
  carrierCountsCache = null
  disruptionCountCache = null
  history.length = 0
}
