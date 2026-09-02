/**
 * Maszyna stanów rozkładu JEDNEGO miasta. Osobna od `board/poller.ts` — tamten
 * racjonuje 100 zapytań/h (niezmiennik #3), GTFS nie ma limitu zapytań, jego
 * ograniczeniem jest czas parsowania. Błąd konfiguracji PKP nie może wygaszać
 * miast, więc wspólny poller odpada.
 *
 * Budzony LENIWIE (`ensureLoaded()` ≙ `registerInterest()`), nigdy awaitowany
 * w route handlerze. Bez `instrumentation.ts` — hak startowy kazałby każdemu
 * wdrożeniu ładować rozkłady miast, których nikt nie ogląda.
 */
import { zonedDateString } from '@/lib/pkp/time'
import type { CityFeed } from './cities'
import type { GtfsSchedule, ScheduleState } from './types'

export type ScheduleStatus = 'idle' | 'loading' | 'ready' | 'failed'

export type GtfsScheduleView = {
  status: ScheduleStatus
  /** Stan dla trasy API — `idle` mapuje się na `loading` (ładowanie zaraz ruszy). */
  state: ScheduleState
  phase: string | null
  loadedAt: string | null
  ageMs: number | null
  feedVersion: string | null
  serviceDates: [string, string, string] | null
  /** `droppedStopTimes + droppedFrequencies`. `null` = nigdy nie parsowano — NIE renderować jako 0. */
  droppedRows: number | null
}

export type GtfsPoller = {
  /** fire-and-forget; NIGDY nie awaitowane w route handlerze. */
  ensureLoaded(): void
  getSchedule(): GtfsSchedule | null
  getView(): GtfsScheduleView
  /** Zatrzymuje timery i zwalnia rozkład — do testów i zamknięcia procesu. */
  dispose(): void
}

export type GtfsPollerDeps = {
  city: CityFeed
  /** Wstrzykiwane — w produkcji `loadSchedule(client, city, { now, onPhase })`. */
  load: (city: CityFeed, now: Date, onPhase: (phase: string) => void) => Promise<GtfsSchedule>
  idleTtlMs: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

/**
 * Przeładowanie po zmianie doby, ale nie o północy — o ~03:40 czasu miasta, po
 * przetoczeniu się sieci nocnej. Realizowane sprawdzaniem co godzinę: gdy
 * `serviceDates[1]` przestaje być „dziś" i lokalna godzina ≥ 3, ładujemy od nowa.
 */
const RELOAD_HOUR = 3
const HOURLY_MS = 60 * 60 * 1000
const IDLE_CHECK_MS = 5 * 60 * 1000

export function createGtfsPoller(deps: GtfsPollerDeps): GtfsPoller {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle))

  let schedule: GtfsSchedule | null = null
  let status: ScheduleStatus = 'idle'
  let phase: string | null = null
  let loadedAtMs: number | null = null
  let loadInFlight = false
  let lastInterestAt = now()
  let disposed = false

  let reloadTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const todayInCity = () => zonedDateString(new Date(now()), deps.city.timezone)

  function scheduleReloadTimer(): void {
    if (reloadTimer !== null) clearTimer(reloadTimer)
    reloadTimer = setTimer(() => {
      if (disposed) return
      maybeRollDay()
      scheduleReloadTimer()
    }, HOURLY_MS)
  }

  function scheduleIdleTimer(): void {
    if (idleTimer !== null) clearTimer(idleTimer)
    idleTimer = setTimer(() => {
      if (disposed) return
      if (schedule !== null && now() - lastInterestAt > deps.idleTtlMs) {
        schedule = null
        status = 'idle'
        phase = null
        loadedAtMs = null
        if (reloadTimer !== null) {
          clearTimer(reloadTimer)
          reloadTimer = null
        }
      } else {
        scheduleIdleTimer()
      }
    }, IDLE_CHECK_MS)
  }

  function cityHour(): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: deps.city.timezone,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(now()))
    return Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  }

  function maybeRollDay(): void {
    if (schedule === null) return
    if (schedule.serviceDates[1] !== todayInCity() && cityHour() >= RELOAD_HOUR) startLoad()
  }

  function startLoad(): void {
    if (loadInFlight || disposed) return
    loadInFlight = true
    if (schedule === null) status = 'loading'
    phase = 'start'

    deps
      .load(deps.city, new Date(now()), (nextPhase) => {
        phase = nextPhase
      })
      .then((loaded) => {
        if (disposed) return
        schedule = loaded
        status = 'ready'
        phase = null
        loadedAtMs = now()
        scheduleReloadTimer()
      })
      .catch(() => {
        if (disposed) return
        // current !== null: dalej serwujemy poprzedni rozkład (UI pokaże wiek).
        status = 'failed'
        phase = null
      })
      .finally(() => {
        loadInFlight = false
      })
  }

  return {
    ensureLoaded() {
      if (disposed) return
      lastInterestAt = now()
      if (idleTimer === null) scheduleIdleTimer()

      if (status === 'idle' || status === 'failed') {
        startLoad()
        return
      }
      if (status === 'ready' && schedule !== null && schedule.serviceDates[1] !== todayInCity()) {
        startLoad()
      }
    },

    getSchedule() {
      return schedule
    },

    getView() {
      const dropped =
        schedule === null ? null : schedule.droppedStopTimes + schedule.droppedFrequencies
      // Jest rozkład → `ready` (serwujemy go, choćby przeterminowany; `status`
      // niesie niuans „w tle failed/loading"). Brak rozkładu → `loading`/`failed`.
      const state: ScheduleState = schedule !== null ? 'ready' : status === 'failed' ? 'failed' : 'loading'
      return {
        status,
        state,
        phase,
        loadedAt: loadedAtMs === null ? null : new Date(loadedAtMs).toISOString(),
        ageMs: loadedAtMs === null ? null : Math.max(0, now() - loadedAtMs),
        feedVersion: schedule?.feedVersion ?? null,
        serviceDates: schedule?.serviceDates ?? null,
        droppedRows: dropped,
      }
    },

    dispose() {
      disposed = true
      schedule = null
      if (reloadTimer !== null) clearTimer(reloadTimer)
      if (idleTimer !== null) clearTimer(idleTimer)
      reloadTimer = null
      idleTimer = null
    },
  }
}
