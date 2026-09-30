import { createTtlCache, type TtlCache } from '@/lib/cache'

export const MAX_CACHED_ENTRIES = 50
/** Ponad godzinę bez odwiedzin pokazujemy spinner zamiast bardzo starej tablicy. */
const CACHE_TTL_MS = 60 * 60_000

export type CachedResult<T> = { data: T; lastSuccessAt: number }

function createResultCache(): TtlCache<CachedResult<unknown>> {
  return createTtlCache<CachedResult<unknown>>({ ttlMs: CACHE_TTL_MS, maxEntries: MAX_CACHED_ENTRIES })
}

// Pamięć modułu przeglądarki: ostatni udany wynik `usePolling` per (namespace, klucz).
let resultCache = createResultCache()

export function readCached<T>(namespace: string | undefined, key: string | null): CachedResult<T> | undefined {
  if (namespace === undefined || key === null) return undefined
  return resultCache.get(`${namespace}|${key}`) as CachedResult<T> | undefined
}

export function writeCached<T>(namespace: string | undefined, key: string | null, entry: CachedResult<T>): void {
  if (namespace !== undefined && key !== null) resultCache.set(`${namespace}|${key}`, entry)
}

/** Tylko testy: cache jest stanem modułu, więc bez resetu testy komponentów widziałyby dane poprzednich. */
export function clearPollingCache(): void {
  resultCache = createResultCache()
}
