/**
 * Maszyna stanów alertów JEDNEGO miasta. Osobna od `poller.ts` (rozkład) i
 * `vehiclePoller.ts` (pozycje) — trzeci rytm (5 min), inne źródło. Zero pola
 * opóźnienia — feed niesie tylko treść ogłoszenia (#13).
 *
 * Przy błędzie pobrania NIE czyścimy ostatnich znanych alertów (UI pokazuje
 * wiek). Dopiero `stop()` zeruje stan do `idle`.
 */
import type { AlertRecord } from './alerts'
import type { AlertFeedResult } from './alertClient'

export type AlertPollerView = {
  state: 'idle' | 'loading' | 'ready' | 'failed'
  fetchedAt: string | null
  ageMs: number | null
  count: number
  droppedAlerts: number | null
}

export type AlertPoller = {
  ensureRunning(): void
  stop(): void
  getAlerts(): AlertRecord[]
  getView(): AlertPollerView
  dispose(): void
}

export type AlertPollerDeps = {
  fetchFeed: () => Promise<AlertFeedResult>
  pollMs: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void
}

export function createAlertPoller(deps: AlertPollerDeps): AlertPoller {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h))
  const pollMs = deps.pollMs

  let state: AlertPollerView['state'] = 'idle'
  let alerts: AlertRecord[] = []
  let fetchedAtMs: number | null = null
  let droppedAlerts: number | null = null
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  // Bumped by stop()/dispose(); a load() started before the bump discards its
  // result instead of resurrecting alerts after a stop.
  let runToken = 0

  function schedule(): void {
    if (disposed) return
    timer = setTimer(() => {
      timer = null
      void load()
      schedule()
    }, pollMs)
  }

  async function load(): Promise<void> {
    if (inFlight || disposed) return
    inFlight = true
    const token = runToken
    if (state === 'idle') state = 'loading'
    try {
      const result = await deps.fetchFeed()
      if (disposed || token !== runToken) return
      alerts = result.alerts
      droppedAlerts = result.droppedAlerts
      fetchedAtMs = now()
      state = 'ready'
    } catch {
      if (disposed || token !== runToken) return
      state = 'failed' // alerts / fetchedAtMs nietknięte — UI pokaże wiek
    } finally {
      if (token === runToken) inFlight = false
    }
  }

  return {
    ensureRunning() {
      if (disposed || timer !== null || state === 'loading') return
      if (state === 'idle' || state === 'failed') {
        void load()
        schedule()
      }
    },
    stop() {
      runToken += 1 // orphan any in-flight fetch so it can't resurrect state
      inFlight = false
      if (timer !== null) clearTimer(timer)
      timer = null
      alerts = []
      fetchedAtMs = null
      droppedAlerts = null
      state = 'idle'
    },
    getAlerts() {
      return alerts
    },
    getView() {
      return {
        state,
        fetchedAt: fetchedAtMs === null ? null : new Date(fetchedAtMs).toISOString(),
        ageMs: fetchedAtMs === null ? null : Math.max(0, now() - fetchedAtMs),
        count: alerts.length,
        droppedAlerts,
      }
    },
    dispose() {
      disposed = true
      runToken += 1
      if (timer !== null) clearTimer(timer)
      timer = null
      alerts = []
    },
  }
}
