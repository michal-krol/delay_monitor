import type { PkpClient, RateLimitBudget } from '../pkp/client'
import { PkpApiError } from '../pkp/client'
import type { RawRoute } from '../pkp/types'
import { transformOperations, type BoardSnapshot } from './transform'

const FORCE_RUN_THROTTLE_MS = 45000
const LOW_BUDGET_INTERVAL_MS = 5 * 60 * 1000

// Basic daje 1000 zapytań/dobę i 100/godzinę jednocześnie. Przy interwale 90 s
// zużywamy ~40/h, więc mniej niż 10 pozostałych w godzinie oznacza, że zaraz
// dostaniemy 429 — nawet jeśli budżet dobowy jest jeszcze zdrowy.
const LOW_BUDGET_DAILY_THRESHOLD = 50
const LOW_BUDGET_HOURLY_THRESHOLD = 10

const RETRY_BASE_DELAY_MS = 500
const RETRY_JITTER_MS = 1000

export type PollerConfig = {
  pollIntervalMs: number
  interestTtlMs: number
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
  sleep?: (ms: number) => Promise<void>
  random?: () => number
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

async function fetchWithRetry(
  client: PkpClient,
  active: string[],
  sleep: (ms: number) => Promise<void>,
  random: () => number
) {
  try {
    return await client.getOperations(active)
  } catch (err) {
    if (err instanceof PkpApiError && err.status >= 500) {
      // Odstęp z jitterem: natychmiastowe ponowienie najczęściej trafia w tę
      // samą awarię po stronie API i zjada drugie zapytanie z limitu.
      await sleep(RETRY_BASE_DELAY_MS + random() * RETRY_JITTER_MS)
      return client.getOperations(active)
    }
    throw err
  }
}

async function fetchRoutesByTrainId(client: PkpClient, active: string[]): Promise<Map<string, RawRoute>> {
  try {
    const routes = await client.getSchedules(active)
    return new Map(routes.map((route) => [`${route.scheduleId}-${route.orderId}`, route]))
  } catch (err) {
    console.error('Poller: błąd pobierania rozkładu (przewoźnik/kategoria będą puste)', err)
    return new Map()
  }
}

export function createPoller(deps: PollerDeps): Poller {
  const { client, config, stationNames } = deps
  const now = deps.now ?? (() => Date.now())
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const random = deps.random ?? Math.random

  const interest = new Map<string, number>()
  const snapshots = new Map<string, BoardSnapshot>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentIntervalMs = config.pollIntervalMs
  let lastRunAt = 0
  let budget: RateLimitBudget | undefined
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
    const active = pruneInactive()

    if (active.length === 0) {
      timer = null
      return
    }

    lastRunAt = now()

    try {
      const [result, routesByTrainId] = await Promise.all([
        fetchWithRetry(client, active, sleep, random),
        fetchRoutesByTrainId(client, active),
      ])
      budget = result.budget
      status = 'ok'
      const fetchedAt = new Date(now()).toISOString()

      for (const stationId of active) {
        snapshots.set(
          stationId,
          transformOperations(
            stationId,
            stationNames.get(stationId) ?? result.stationNames[stationId] ?? stationId,
            result.trains,
            result.stationNames,
            routesByTrainId,
            fetchedAt
          )
        )
      }

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

  function wake(forceImmediate: boolean): void {
    if (timer !== null) return

    if (forceImmediate) {
      void runTick()
      return
    }

    timer = setTimeout(() => void runTick(), currentIntervalMs)
  }

  return {
    registerInterest(stationIds: string[]): void {
      const wasAsleep = timer === null
      const timestamp = now()
      const hasStationWithoutData = stationIds.some((stationId) => !snapshots.has(stationId))

      for (const stationId of stationIds) {
        interest.set(stationId, timestamp)
      }

      if (wasAsleep) {
        wake(true)
        return
      }

      const sinceLastRun = timestamp - lastRunAt
      if (sinceLastRun >= FORCE_RUN_THROTTLE_MS || hasStationWithoutData) {
        if (timer !== null) clearTimeout(timer)
        timer = null
        void runTick()
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
