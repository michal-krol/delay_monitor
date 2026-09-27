import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CityFeed } from './cities'
import { parseAlertFeed, type AlertRecord } from './alerts'

export type AlertFeedResult = { alerts: AlertRecord[]; droppedAlerts: number; feedTime: string | null }

const USER_AGENT = 'delay-monitor-gtfs-loader (+https://github.com/michal-krol/delay_monitor)'

/** Krawędź sieci: goły GET JSON. Rzuca na nie-2xx (poller degraduje do ostatnich znanych). */
export async function fetchAlertFeed(url: string, fetchImpl: typeof fetch = fetch): Promise<AlertFeedResult> {
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (!response.ok) throw new Error(`alerts.json: HTTP ${response.status}`)
  return parseAlertFeed(await response.json())
}

const DEFAULT_ROOT = path.join(process.cwd(), 'fixtures', 'gtfs')

/** Mock: fixture `.json` z dysku. Bez podstawiania czasu — alerty nie mają pola wieku per-rekord. */
export function mockAlertFeed(city: CityFeed, root: string = DEFAULT_ROOT): () => Promise<AlertFeedResult> {
  const file = path.join(root, city.id, 'alerts.json')
  return async () => {
    try {
      return parseAlertFeed(JSON.parse(await readFile(file, 'utf8')))
    } catch {
      // Brak pliku LUB uszkodzony JSON — poller degraduje do ostatnich znanych.
      return { alerts: [], droppedAlerts: 0, feedTime: null }
    }
  }
}
