import type { PkpClient, RateLimitBudget } from '../pkp/client'
import { PkpApiError } from '../pkp/client'
import type { RawRoute } from '../pkp/types'
import { routeKey, transformOperations, type BoardSnapshot } from './transform'
import { collectUpstreamCandidates } from './upstreamEstimate'

const FORCE_RUN_THROTTLE_MS = 45000
const LOW_BUDGET_INTERVAL_MS = 5 * 60 * 1000

// Basic daje 1000 zapytań/dobę i 100/godzinę jednocześnie. Przy interwale 90 s
// zużywamy ~40/h, więc mniej niż 10 pozostałych w godzinie oznacza, że zaraz
// dostaniemy 429 — nawet jeśli budżet dobowy jest jeszcze zdrowy.
const LOW_BUDGET_DAILY_THRESHOLD = 50
const LOW_BUDGET_HOURLY_THRESHOLD = 10

/**
 * Stacja bez danych wymusza przebieg poza harmonogramem, żeby pokazać rozkład
 * od razu po dodaniu do ulubionych. Bez limitu jest to jednak dźwignia: każde
 * nieznane ID omija dławik 45 s i zamienia się w zapytanie do PKP, więc seria
 * żądań wyczerpuje limit 100/h i degraduje aplikację dla wszystkich.
 *
 * Pula wymuszeń w oknie kroczącym zamyka dźwignię, zostawiając zapas
 * wielokrotnie wyższy niż realne użycie — użytkownik dodaje kilka stacji, nie
 * kilkadziesiąt na godzinę. Limit dotyczy **wyłącznie** obejścia dławika;
 * zwykły rytm (45 s od ostatniego przebiegu) jest już ograniczony sam przez się.
 */
const FORCED_RUN_WINDOW_MS = 60 * 60 * 1000
const MAX_FORCED_RUNS_PER_WINDOW = 10

/**
 * Domyślny twardy sufit liczby jednocześnie obserwowanych stacji w `interest`/
 * `snapshots`. TTL (`interestTtlMs`) sam ogranicza CZAS życia wpisu, ale nie
 * jego LICZBĘ w tym oknie -- bez tego seria żądań o różne, tylko poprawnie
 * sformatowane ID stacji (walidacja formatu w `/api/board` nie sprawdza, że
 * stacja naprawdę istnieje) rosłaby bez ograniczenia przez całe okno TTL
 * (AGENTS.md #5: cache musi mieć TTL I limit wpisów, nie gołą `Map`). Margines
 * wielokrotnie wyższy niż realna liczba stacji w sieci PKP (rzędu tysięcy).
 */
const DEFAULT_MAX_WATCHED_STATIONS = 5000

export type PollerConfig = {
  pollIntervalMs: number
  interestTtlMs: number
  /** Nadpisanie `DEFAULT_MAX_WATCHED_STATIONS` -- głównie po to, żeby test mógł sprawdzić limit bez tysięcy wywołań. */
  maxWatchedStations?: number
}

/**
 * Poller potrzebuje wyłącznie odczytu nazwy stacji. Węższy typ niż `Map`
 * pozwala podać cache z eksmisją, a w testach zwykłą mapę.
 */
export type StationNameLookup = {
  get(stationId: string): string | undefined
}

export type PollerDeps = {
  client: PkpClient
  config: PollerConfig
  stationNames: StationNameLookup
  now?: () => number
}

/**
 * Czy warto zwolnić. Nieznany budżet (null — brak nagłówka w odpowiedzi) nie
 * jest traktowany jak niski: inaczej API, które przestało odsyłać nagłówki,
 * na stałe zepchnęłoby poller na interwał awaryjny.
 */
function isBudgetLow(budget: RateLimitBudget): boolean {
  if (budget.daily !== null && budget.daily < LOW_BUDGET_DAILY_THRESHOLD) return true
  if (budget.hourly !== null && budget.hourly < LOW_BUDGET_HOURLY_THRESHOLD) return true
  return false
}

export type PollerStatus = 'ok' | 'configError' | 'degraded'

export type Poller = {
  registerInterest(stationIds: string[]): void
  getSnapshot(stationId: string): BoardSnapshot | undefined
  getBudget(): RateLimitBudget | undefined
  getStatus(): PollerStatus
  isAwake(): boolean
  /** Czy poller zwolnił poniżej skonfigurowanego tempa (niski budżet albo 429). */
  isThrottled(): boolean
}

type RoutesLookup = {
  routesByTrainId: Map<string, RawRoute>
  carrierNames: Record<string, string>
  /** Pełny słownik nazw stacji ze `/schedules` — patrz merge w `runTick`. */
  scheduleStationNames: Record<string, string>
}

async function fetchRoutesByTrainId(client: PkpClient, active: string[]): Promise<RoutesLookup> {
  try {
    const { routes, carrierNames, stationNames } = await client.getSchedules(active)
    const routesByTrainId = new Map(
      routes.map((route) => [routeKey(route.scheduleId, route.orderId, route.trainOrderId), route])
    )
    return { routesByTrainId, carrierNames, scheduleStationNames: stationNames }
  } catch (err) {
    console.error('Poller: błąd pobierania rozkładu (przewoźnik/kategoria będą puste)', err)
    return { routesByTrainId: new Map(), carrierNames: {}, scheduleStationNames: {} }
  }
}

export function createPoller(deps: PollerDeps): Poller {
  const { client, config, stationNames } = deps
  const now = deps.now ?? (() => Date.now())
  const maxWatchedStations = config.maxWatchedStations ?? DEFAULT_MAX_WATCHED_STATIONS

  const interest = new Map<string, number>()
  const snapshots = new Map<string, BoardSnapshot>()
  /**
   * Stacje "pomocnicze" -- dokładane do `/operations` obok prawdziwie
   * obserwowanych (`interest`), żeby liczyć estymatę opóźnienia dla
   * połączeń "w trasie" (patrz `upstreamEstimate.ts`). Świadomie POZA
   * `interest`: nie mają budzić pollera same z siebie, nie dostają
   * własnego `snapshots.set(...)`, nie przechodzą przez `/api/board`'s
   * limit 20 stacji -- to wyłącznie wewnętrzny dodatek do zapytania
   * `/operations`, przeliczany od zera po każdym udanym cyklu.
   */
  let auxStationIds: ReadonlySet<string> = new Set()
  /**
   * `timer` jest `null` przez CAŁY czas trwania `runTick()` (nie tylko
   * podczas snu), bo jest resetowany na starcie i ustawiany dopiero po
   * `await` na końcu -- więc `registerInterest()` wywołane w trakcie
   * trwającego zapytania widziałoby `wasAsleep` i wystrzeliwało drugi,
   * równoległy fetch do PKP. Ta flaga to blokuje.
   */
  let tickInFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentIntervalMs = config.pollIntervalMs
  let lastRunAt = 0
  let budget: RateLimitBudget | undefined
  /** Znaczniki czasu wymuszonych przebiegów w bieżącym oknie kroczącym. */
  let forcedRunsAt: number[] = []
  let status: PollerStatus = 'ok'

  function pruneInactive(): string[] {
    const cutoff = now() - config.interestTtlMs
    for (const [stationId, ts] of interest) {
      if (ts < cutoff) {
        interest.delete(stationId)
        snapshots.delete(stationId)
      }
    }
    return [...interest.keys()]
  }

  async function runTick(): Promise<void> {
    if (tickInFlight) return
    tickInFlight = true
    try {
      await runTickBody()
    } finally {
      tickInFlight = false
    }
  }

  async function runTickBody(): Promise<void> {
    const realActive = pruneInactive()

    if (realActive.length === 0) {
      // Zasypianie czyści też stacje pomocnicze -- nie ma po co je nieść
      // dalej, skoro nic realnie obserwowanego nie zostało.
      auxStationIds = new Set()
      timer = null
      return
    }

    lastRunAt = now()
    // /schedules pyta wyłącznie o realne stacje -- klucz cache'u 24h
    // (`schedulesCache`, patrz `client.ts`) musi być stabilny, więc migające
    // stacje pomocnicze NIE mogą do niego trafić, inaczej cache chybiałby
    // niemal co cykl. /operations pyta o realne ORAZ pomocnicze naraz --
    // nadal jedno zapytanie, tylko z kilkoma dodatkowymi ID.
    const operationsStationIds = [...new Set([...realActive, ...auxStationIds])]

    try {
      const [result, { routesByTrainId, carrierNames, scheduleStationNames }] = await Promise.all([
        client.getOperations(operationsStationIds),
        fetchRoutesByTrainId(client, realActive),
      ])
      budget = result.budget
      status = 'ok'
      const fetchedAt = new Date(now()).toISOString()

      // /operations nie ma już (świadomie, patrz client.ts) własnego pełnego
      // słownika nazw stacji — zasila go teraz /schedules. `result.stationNames`
      // idzie na wierzch jako świeższe dla samej zapytanej stacji.
      const mergedStationNames = { ...scheduleStationNames, ...result.stationNames }

      for (const stationId of realActive) {
        snapshots.set(
          stationId,
          transformOperations(
            stationId,
            stationNames.get(stationId) ?? mergedStationNames[stationId] ?? stationId,
            result.trains,
            mergedStationNames,
            routesByTrainId,
            carrierNames,
            fetchedAt
          )
        )
      }

      // Przeliczone od zera z wyniku TEGO cyklu -- jak tylko śledzony
      // przystanek się potwierdzi (albo zniknie), jego stacja pomocnicza
      // sama wypada z następnego zapytania, bez osobnego wygaszania.
      auxStationIds = collectUpstreamCandidates(realActive, result.trains, routesByTrainId)

      currentIntervalMs = isBudgetLow(budget) ? LOW_BUDGET_INTERVAL_MS : config.pollIntervalMs
    } catch (err) {
      if (err instanceof PkpApiError && err.status === 401) {
        status = 'configError'
        timer = null
        return
      }
      if (err instanceof PkpApiError && err.status === 429) {
        currentIntervalMs = Math.min(currentIntervalMs * 2, LOW_BUDGET_INTERVAL_MS)
      }
      status = 'degraded'
      console.error('Poller: błąd pobierania operacji', err)
    }

    timer = setTimeout(() => void runTick(), currentIntervalMs)
  }

  /**
   * Pobiera jedno wymuszenie z puli okna kroczącego. `false` znaczy, że pula na
   * to okno jest wyczerpana i żądanie musi poczekać na zwykły przebieg.
   */
  function consumeForcedRun(timestamp: number): boolean {
    const cutoff = timestamp - FORCED_RUN_WINDOW_MS
    forcedRunsAt = forcedRunsAt.filter((at) => at > cutoff)

    if (forcedRunsAt.length >= MAX_FORCED_RUNS_PER_WINDOW) return false

    forcedRunsAt.push(timestamp)
    return true
  }

  function forceRunNow(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    void runTick()
  }

  return {
    registerInterest(stationIds: string[]): void {
      const wasAsleep = timer === null
      const timestamp = now()
      const hasStationWithoutData = stationIds.some((stationId) => !snapshots.has(stationId))

      for (const stationId of stationIds) {
        // Eksmisja tylko dla faktycznie nowej stacji przy pełnej pojemności --
        // odświeżenie już obserwowanej nigdy nie powiększa `interest`, więc nie
        // ma czego eksmitować. FIFO po kolejności wstawienia (`Map` zachowuje ją
        // z definicji), nie LRU -- ten sam kompromis co `createTtlCache()`.
        if (!interest.has(stationId) && interest.size >= maxWatchedStations) {
          const oldest = interest.keys().next()
          if (oldest.done === false) {
            interest.delete(oldest.value)
            snapshots.delete(oldest.value)
          }
        }
        interest.set(stationId, timestamp)
      }

      // Obudzenie z uśpienia nie zużywa puli: wymaga 5 minut ciszy, więc nie da
      // się go powtarzać w pętli, a pierwszy użytkownik po przerwie nie powinien
      // czekać na kolejny przebieg. `timer` jest tu zawsze `null` (to definicja
      // `wasAsleep`), więc zachowanie jest identyczne jak przy zwykłym
      // wymuszeniu — forceRunNow() obsługuje oba przypadki.
      if (wasAsleep) {
        forceRunNow()
        return
      }

      const sinceLastRun = timestamp - lastRunAt

      if (sinceLastRun >= FORCE_RUN_THROTTLE_MS) {
        forceRunNow()
        return
      }

      if (hasStationWithoutData && consumeForcedRun(timestamp)) {
        forceRunNow()
      }
    },

    getSnapshot(stationId: string): BoardSnapshot | undefined {
      return snapshots.get(stationId)
    },

    getBudget() {
      return budget
    },

    getStatus(): PollerStatus {
      return status
    },

    isAwake(): boolean {
      return timer !== null
    },

    isThrottled(): boolean {
      return currentIntervalMs > config.pollIntervalMs
    },
  }
}
