/**
 * Maszyna stanów pozycji pojazdów JEDNEGO miasta. Osobna od `poller.ts`
 * (rozkład) — inny rytm (15 s vs raz na dobę), inne źródło (feed pozycji vs
 * statyczny GTFS). Niezmiennik #13: ZERO pola opóźnienia — feed niesie tylko
 * pozycje, wiek danych widać po `ageMs`.
 *
 * Przy błędzie pobrania NIE czyścimy ostatnich znanych pozycji (UI pokazuje
 * wiek, jak `poller.ts`). Dopiero `stop()` zeruje stan do `idle`.
 */
import type { VehiclePosition } from './vehicles'
import type { VehicleFeedResult } from './vehicleClient'

export type VehiclePollerView = {
  state: 'idle' | 'loading' | 'ready' | 'failed'
  fetchedAt: string | null
  ageMs: number | null
  count: number
  droppedPositions: number | null
}

export type VehiclePoller = {
  ensureRunning(): void
  stop(): void
  getPositions(): VehiclePosition[]
  getView(): VehiclePollerView
  dispose(): void
}

export type VehiclePollerDeps = {
  fetchFeed: () => Promise<VehicleFeedResult>
  pollMs: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void
}

export function createVehiclePoller(deps: VehiclePollerDeps): VehiclePoller {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h))
  const pollMs = deps.pollMs

  let state: VehiclePollerView['state'] = 'idle'
  let positions: VehiclePosition[] = []
  let fetchedAtMs: number | null = null
  let droppedPositions: number | null = null
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  // Bumped by stop()/dispose(); a load() started before the bump discards its
  // result instead of resurrecting positions after a stop.
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
      positions = result.positions
      droppedPositions = result.droppedPositions
      fetchedAtMs = now()
      state = 'ready'
    } catch {
      if (disposed || token !== runToken) return
      state = 'failed' // positions / fetchedAtMs nietknięte — UI pokaże wiek
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
      positions = []
      fetchedAtMs = null
      droppedPositions = null
      state = 'idle'
    },
    getPositions() {
      return positions
    },
    getView() {
      return {
        state,
        fetchedAt: fetchedAtMs === null ? null : new Date(fetchedAtMs).toISOString(),
        ageMs: fetchedAtMs === null ? null : Math.max(0, now() - fetchedAtMs),
        count: positions.length,
        droppedPositions,
      }
    },
    dispose() {
      disposed = true
      runToken += 1
      if (timer !== null) clearTimer(timer)
      timer = null
      positions = []
    },
  }
}
