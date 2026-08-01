import type { PkpClient } from '../pkp/client'
import { PkpApiError } from '../pkp/client'
import type { RawOperation } from '../pkp/types'
import { transformOperations, type BoardSnapshot } from './transform'

const FORCE_RUN_THROTTLE_MS = 45000
const LOW_BUDGET_DAILY_THRESHOLD = 50
const LOW_BUDGET_INTERVAL_MS = 5 * 60 * 1000

export type PollerConfig = {
  pollIntervalMs: number
  interestTtlMs: number
}

export type PollerDeps = {
  client: PkpClient
  config: PollerConfig
  stationNames: Map<string, string>
  now?: () => number
}

export type PollerStatus = 'ok' | 'configError' | 'degraded'

export type Poller = {
  registerInterest(stationIds: string[]): void
  getSnapshot(stationId: string): BoardSnapshot | undefined
  getBudget(): { hourly: number; daily: number } | undefined
  getStatus(): PollerStatus
  isAwake(): boolean
}

async function fetchWithRetry(client: PkpClient, active: string[]) {
  try {
    return await client.getOperations(active)
  } catch (err) {
    if (err instanceof PkpApiError && err.status >= 500) {
      return client.getOperations(active)
    }
    throw err
  }
}

function groupByStation(operations: RawOperation[]): Map<string, RawOperation[]> {
  const grouped = new Map<string, RawOperation[]>()
  for (const op of operations) {
    const list = grouped.get(op.stationId) ?? []
    list.push(op)
    grouped.set(op.stationId, list)
  }
  return grouped
}

export function createPoller(deps: PollerDeps): Poller {
  const { client, config, stationNames } = deps
  const now = deps.now ?? (() => Date.now())

  const interest = new Map<string, number>()
  const snapshots = new Map<string, BoardSnapshot>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentIntervalMs = config.pollIntervalMs
  let lastRunAt = 0
  let budget: { hourly: number; daily: number } | undefined
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
      const result = await fetchWithRetry(client, active)
      budget = result.budget
      status = 'ok'
      const fetchedAt = new Date(now()).toISOString()
      const grouped = groupByStation(result.operations)

      for (const stationId of active) {
        snapshots.set(
          stationId,
          transformOperations(
            stationId,
            stationNames.get(stationId) ?? stationId,
            grouped.get(stationId) ?? [],
            fetchedAt
          )
        )
      }

      currentIntervalMs = budget.daily < LOW_BUDGET_DAILY_THRESHOLD ? LOW_BUDGET_INTERVAL_MS : config.pollIntervalMs
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

      for (const stationId of stationIds) {
        interest.set(stationId, timestamp)
      }

      if (wasAsleep) {
        wake(true)
        return
      }

      const sinceLastRun = timestamp - lastRunAt
      if (sinceLastRun >= FORCE_RUN_THROTTLE_MS) {
        clearTimeout(timer)
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
  }
}
