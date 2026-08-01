import { loadConfig } from '../config'
import { createTtlCache } from '../cache'
import { createLiveClient, type PkpClient } from '../pkp/client'
import { createMockClient } from '../pkp/mock'
import { createPoller, type Poller } from './poller'

export const appConfig = loadConfig()

export const client: PkpClient =
  appConfig.dataSource === 'live' ? createLiveClient(appConfig.apiKey as string) : createMockClient()

// Nazwy stacji zapamiętane przy wyszukiwaniu, żeby poller mógł opisać snapshot
// zanim zobaczy stację w odpowiedzi /operations. Ograniczone, bo bez limitu
// rejestr rósłby z każdym wyszukiwaniem przez cały czas życia procesu.
// Wygaśnięcie wpisu jest nieszkodliwe: transform i tak sięga po nazwę
// z odpowiedzi API, a w ostateczności pokazuje samo ID.
const STATION_NAME_TTL_MS = 24 * 60 * 60 * 1000
const STATION_NAME_MAX_ENTRIES = 2000

const stationNames = createTtlCache<string>({
  ttlMs: STATION_NAME_TTL_MS,
  maxEntries: STATION_NAME_MAX_ENTRIES,
})

export function rememberStationName(id: string, name: string): void {
  stationNames.set(id, name)
}

export const poller: Poller = createPoller({
  client,
  config: { pollIntervalMs: appConfig.pollIntervalMs, interestTtlMs: appConfig.interestTtlMs },
  stationNames,
})
