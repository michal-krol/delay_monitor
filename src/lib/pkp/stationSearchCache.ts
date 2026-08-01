import type { Station } from './types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CacheEntry = {
  stations: Station[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCached(query: string): Station[] | undefined {
  const entry = cache.get(query)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(query)
    return undefined
  }
  return entry.stations
}

export function setCached(query: string, stations: Station[]): void {
  cache.set(query, { stations, expiresAt: Date.now() + CACHE_TTL_MS })
}
