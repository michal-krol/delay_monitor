import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CityFeed } from './cities'
import { parseVehicleFeed, type VehiclePosition } from './vehicles'

export type VehicleFeedResult = {
  positions: VehiclePosition[]
  droppedPositions: number
  feedTime: string | null
}

const USER_AGENT = 'delay-monitor-gtfs-loader (+https://github.com/michal-krol/delay_monitor)'

/** Krawędź sieci: goły GET JSON. Rzuca na nie-2xx (poller degraduje do ostatnich znanych). */
export async function fetchVehicleFeed(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VehicleFeedResult> {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`vehicles.json: HTTP ${response.status}`)
  return parseVehicleFeed(await response.json())
}

const DEFAULT_ROOT = path.join(process.cwd(), 'fixtures', 'gtfs')

/** Mock: fixture `.json` z dysku, `{{NOW}}` podstawiany aktualnym ISO (świeży wiek w testach). */
export function mockVehicleFeed(
  city: CityFeed,
  root: string = DEFAULT_ROOT,
): () => Promise<VehicleFeedResult> {
  const file = path.join(root, city.id, 'vehicles.json')
  return async () => {
    try {
      const raw = await readFile(file, 'utf8')
      const now = new Date().toISOString()
      return parseVehicleFeed(JSON.parse(raw.replaceAll('{{NOW}}', now)))
    } catch {
      // Brak pliku LUB uszkodzony JSON — poller degraduje do ostatnich znanych.
      return { positions: [], droppedPositions: 0, feedTime: null }
    }
  }
}
