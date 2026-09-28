/**
 * Wybór live/mock i rejestr pollerów — po jednym na miasto z `GTFS_CITIES`.
 * Rozkłady włączonych miast są ładowane z góry przy starcie procesu
 * (`warmUpGtfsPollers`) i zostają w pamięci; pollery pozycji/alertów ruszają
 * dopiero z widzem. Żaden inny moduł nie powinien wiedzieć, skąd pochodzą dane.
 */
import { loadConfig } from '@/lib/config'
import { getCity, type CityFeed } from './cities'
import { createLiveClient, type GtfsClient } from './client'
import { loadSchedule } from './loader'
import { createMockClient } from './mock'
import { createGtfsPoller, type GtfsPoller } from './poller'
import { fetchVehicleFeed, mockVehicleFeed, type VehicleFeedResult } from './vehicleClient'
import { createVehiclePoller, type VehiclePoller } from './vehiclePoller'
import { fetchAlertFeed, mockAlertFeed, type AlertFeedResult } from './alertClient'
import { createAlertPoller, type AlertPoller } from './alertPoller'

const config = loadConfig()

/**
 * Zweryfikowane empirycznie (`next build --webpack` + `next start`, `GET
 * /api/health` PRZED jakimkolwiek żądaniem GTFS, AGENTS.md #14): webpack
 * bundluje `instrumentation.ts` i każdy route handler jako OSOBNE chunki,
 * każdy z własną instancją modułu — `new Map()` na poziomie modułu dawał więc
 * DWA różne rejestry (pusty w route handlerach mimo rozgrzewki w instrumentacji,
 * `/api/health` pokazywał `idle`). `globalThis` pod jednym kluczem `Symbol.for`
 * jest wspólny dla całego procesu Node niezależnie od liczby bundli.
 */
type GtfsPollerRegistry = {
  pollers: Map<string, GtfsPoller>
  vehiclePollers: Map<string, VehiclePoller>
  alertPollers: Map<string, AlertPoller>
}

const REGISTRY_KEY = Symbol.for('delay-monitor.gtfs.pollerRegistry')

function gtfsPollerRegistry(): GtfsPollerRegistry {
  const g = globalThis as typeof globalThis & { [REGISTRY_KEY]?: GtfsPollerRegistry }
  return (g[REGISTRY_KEY] ??= {
    pollers: new Map(),
    vehiclePollers: new Map(),
    alertPollers: new Map(),
  })
}

const { pollers, vehiclePollers, alertPollers } = gtfsPollerRegistry()

function clientFor(city: CityFeed): GtfsClient {
  return config.gtfs.dataSource === 'mock' ? createMockClient(city) : createLiveClient(city)
}

function vehicleFeedFor(city: CityFeed): () => Promise<VehicleFeedResult> {
  if (config.gtfs.dataSource === 'mock') return mockVehicleFeed(city)
  const url = city.vehiclesUrl
  if (url === null) return async () => ({ positions: [], droppedPositions: 0, feedTime: null })
  return () => fetchVehicleFeed(url)
}

function alertFeedFor(city: CityFeed): () => Promise<AlertFeedResult> {
  if (config.gtfs.dataSource === 'mock') return mockAlertFeed(city)
  const url = city.alertsUrl
  if (url === null) return async () => ({ alerts: [], droppedAlerts: 0, feedTime: null })
  return () => fetchAlertFeed(url)
}

/**
 * Poller miasta, albo `null` gdy: podprojekt wyłączony, miasto nie jest na
 * liście `GTFS_CITIES`, albo nie ma go w rejestrze. Route handler traktuje
 * `null` jak nieznane `city` → 400.
 */
export function getGtfsPoller(cityId: string): GtfsPoller | null {
  if (!config.gtfs.enabled) return null
  if (!config.gtfs.cities.includes(cityId)) return null
  const city = getCity(cityId)
  if (city === null) return null

  let poller = pollers.get(cityId)
  if (poller === undefined) {
    const vehiclePoller = createVehiclePoller({
      fetchFeed: vehicleFeedFor(city),
      pollMs: config.gtfs.vehiclePollMs,
    })
    vehiclePollers.set(cityId, vehiclePoller)
    const alertPoller = createAlertPoller({
      fetchFeed: alertFeedFor(city),
      pollMs: config.gtfs.alertPollMs,
    })
    alertPollers.set(cityId, alertPoller)
    poller = createGtfsPoller({
      city,
      idleTtlMs: config.gtfs.idleTtlMs,
      load: (feedCity, now, onPhase) => loadSchedule(clientFor(feedCity), feedCity, { now, onPhase }),
      // Każdy poller stworzony tutaj jest dla miasta z `enabledGtfsCities()`
      // (warunki wyżej), więc `instrumentation.ts` go rozgrzewa przy starcie
      // procesu — rozkład ma zostać rezydentny na stałe (decyzja
      // właściciela). Poller pozycji/alertów mimo to zatrzymuje się bez
      // widzów, patrz `onIdle` niżej.
      keepSchedule: true,
      onWake: () => {
        vehiclePoller.ensureRunning()
        alertPoller.ensureRunning()
      },
      onIdle: () => {
        vehiclePoller.stop()
        alertPoller.stop()
      },
    })
    pollers.set(cityId, poller)
  }
  return poller
}

/** Poller pozycji pojazdów miasta bez tworzenia nowego — do `/api/health` i tras GTFS. */
export function peekVehiclePoller(cityId: string): VehiclePoller | null {
  return vehiclePollers.get(cityId) ?? null
}

/** Poller alertów miasta bez tworzenia nowego — do tras GTFS. */
export function peekAlertPoller(cityId: string): AlertPoller | null {
  return alertPollers.get(cityId) ?? null
}

/** Istniejący poller miasta bez tworzenia nowego — do `/api/health` (samo raportowanie). */
export function peekGtfsPoller(cityId: string): GtfsPoller | null {
  return pollers.get(cityId) ?? null
}

/** Lista miast, dla których podprojekt jest aktywny (wpis w rejestrze ∩ GTFS_CITIES). */
export function enabledGtfsCities(): CityFeed[] {
  if (!config.gtfs.enabled) return []
  return config.gtfs.cities.map(getCity).filter((city): city is CityFeed => city !== null)
}

/**
 * Rozgrzewka przy starcie procesu — wołana WYŁĄCZNIE z `instrumentation.ts`
 * (`register()`), fire-and-forget (`preload()` nigdy nie czeka na ładowanie).
 * Rusza TYLKO ładowanie rozkładu -- pollery pozycji i alertów budzi dopiero
 * realny widz. Brak włączonych miast (GTFS wyłączony albo `GTFS_CITIES` puste) = no-op.
 */
export function warmUpGtfsPollers(): void {
  for (const city of enabledGtfsCities()) {
    getGtfsPoller(city.id)?.preload()
  }
}

/** Do testów: zwalnia wszystkie pollery. */
export function __disposeAllGtfsPollers(): void {
  for (const poller of pollers.values()) poller.dispose()
  pollers.clear()
  for (const vp of vehiclePollers.values()) vp.dispose()
  vehiclePollers.clear()
  for (const ap of alertPollers.values()) ap.dispose()
  alertPollers.clear()
}
