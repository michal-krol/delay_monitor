/**
 * Wybór live/mock i rejestr pollerów — po jednym na miasto, tworzone LENIWIE
 * (pamięć zajmują wyłącznie miasta faktycznie oglądane). Żaden inny moduł nie
 * powinien wiedzieć, skąd pochodzą dane.
 */
import { loadConfig } from '@/lib/config'
import { getCity, type CityFeed } from './cities'
import type { GtfsClient } from './client'
import { loadSchedule } from './loader'
import { createMockClient } from './mock'
import { createGtfsPoller, type GtfsPoller } from './poller'

const config = loadConfig()
const pollers = new Map<string, GtfsPoller>()

function clientFor(city: CityFeed): GtfsClient {
  if (config.gtfs.dataSource === 'mock') return createMockClient(city)
  // ponytail: `createLiveClient(city)` podłączamy tu w etapie 3. Do tego czasu
  // `GTFS_DATA_SOURCE` domyślnie = `mock`, a ta gałąź jest nieosiągalna.
  throw new Error('GTFS_DATA_SOURCE=live wymaga klienta z etapu 3 (jeszcze nie zaimplementowany)')
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
    poller = createGtfsPoller({
      city,
      idleTtlMs: config.gtfs.idleTtlMs,
      load: (feedCity, now, onPhase) => loadSchedule(clientFor(feedCity), feedCity, { now, onPhase }),
    })
    pollers.set(cityId, poller)
  }
  return poller
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
}
