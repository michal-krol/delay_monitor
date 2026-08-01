import { loadConfig } from '../config'
import { createLiveClient, type PkpClient } from '../pkp/client'
import { createMockClient } from '../pkp/mock'
import { createPoller, type Poller } from './poller'

export const appConfig = loadConfig()

export const client: PkpClient =
  appConfig.dataSource === 'live' ? createLiveClient(appConfig.apiKey as string) : createMockClient()

const stationNames = new Map<string, string>()

export function rememberStationName(id: string, name: string): void {
  stationNames.set(id, name)
}

export const poller: Poller = createPoller({
  client,
  config: { pollIntervalMs: appConfig.pollIntervalMs, interestTtlMs: appConfig.interestTtlMs },
  stationNames,
})
