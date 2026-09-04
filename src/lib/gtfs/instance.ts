/**
 * Wybór live/mock i rejestr pollerów — po jednym na miasto, tworzone LENIWIE
 * (pamięć zajmują wyłącznie miasta faktycznie oglądane). Żaden inny moduł nie
 * powinien wiedzieć, skąd pochodzą dane.
 */
import { loadConfig } from '@/lib/config'
import { getCity, type CityFeed } from './cities'
import { createLiveClient, type GtfsClient } from './client'
import { loadSchedule } from './loader'
import { createMockClient } from './mock'
import { createGtfsPoller, type GtfsPoller } from './poller'
import { fetchVehicleFeed, mockVehicleFeed, type VehicleFeedResult } from './vehicleClient'
import { createVehiclePoller, type VehiclePoller } from './vehiclePoller'

const config = loadConfig()
const pollers = new Map<string, GtfsPoller>()
const vehiclePollers = new Map<string, VehiclePoller>()

function clientFor(city: CityFeed): GtfsClient {
  return config.gtfs.dataSource === 'mock' ? createMockClient(city) : createLiveClient(city)
}

function vehicleFeedFor(city: CityFeed): () => Promise<VehicleFeedResult> {
  if (config.gtfs.dataSource === 'mock') return mockVehicleFeed(city)
  const url = city.vehiclesUrl
  if (url === null) return async () => ({ positions: [], droppedPositions: 0, feedTime: null })
  return () => fetchVehicleFeed(url)
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
    poller = createGtfsPoller({
      city,
      idleTtlMs: config.gtfs.idleTtlMs,
      load: (feedCity, now, onPhase) => loadSchedule(clientFor(feedCity), feedCity, { now, onPhase }),
      onWake: () => vehiclePoller.ensureRunning(),
      onIdle: () => vehiclePoller.stop(),
    })
    pollers.set(cityId, poller)
  }
  return poller
}

/** Poller pozycji pojazdów miasta bez tworzenia nowego — do `/api/health` i tras GTFS. */
export function peekVehiclePoller(cityId: string): VehiclePoller | null {
  return vehiclePollers.get(cityId) ?? null
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

/** Do testów: zwalnia wszystkie pollery. */
export function __disposeAllGtfsPollers(): void {
  for (const poller of pollers.values()) poller.dispose()
  pollers.clear()
  for (const vp of vehiclePollers.values()) vp.dispose()
  vehiclePollers.clear()
}
