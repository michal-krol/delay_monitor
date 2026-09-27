import type { CityFeed } from '@/lib/gtfs/cities'
import { createTtlCache } from '@/lib/cache'
import { client } from './instance'

export type CityRailStation = { id: string; name: string }

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 50

const cache = createTtlCache<CityRailStation[]>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

/**
 * Uchwyty na trwające wyszukania, tak samo jak `inFlight` w `/api/train/route.ts`
 * -- cache sprawdzany przed `await` i zapisywany po nim jest wyścigiem
 * (AGENTS.md #4): kilka otwartych kart mapy pollujących `/api/rail-stations`
 * dla tego samego miasta w tej samej chwili odpaliłoby każda swoje własne
 * `searchStations`.
 */
const inFlight = new Map<string, Promise<CityRailStation[]>>()

async function loadCityRailStations(city: CityFeed): Promise<CityRailStation[]> {
  try {
    const matches = await client.searchStations(city.name)
    return matches.filter((station) => station.name.startsWith(city.railStationPrefix)).map((station) => ({ id: station.id, name: station.name }))
  } catch {
    return []
  }
}

/**
 * Stacje PKP należące do miasta, po prefiksie nazwy (`city.railStationPrefix`).
 * Wydzielone z `/api/cities/route.ts`, żeby `/api/rail-stations` reużywało
 * dokładnie tę samą regułę zamiast drugiej kopii filtra.
 *
 * Cache'owane 10 min, PER MIASTO -- także wynik `[]` po awarii wyszukania
 * (`catch` powyżej). `/api/rail-stations` jest pollowany co 90 s przez KAŻDĄ
 * otwartą kartę mapy miasta (nowy, automatyczny, cykliczny wywołujący --
 * inaczej niż `/api/cities`, wołane raz na wczytanie strony), więc bez tej
 * negatywnej pamięci sustained awaria słownika stacji PKP (`fetchAllStations()`
 * w `pkp/client.ts` samo nie ma negatywnego cache'u) powtarzałaby próbę
 * `searchStations` przy każdym pollu zamiast raz na 10 minut -- AGENTS.md #3.
 */
export async function resolveCityRailStations(city: CityFeed): Promise<CityRailStation[]> {
  const cached = cache.get(city.id)
  if (cached !== undefined) return cached

  let pending = inFlight.get(city.id)
  if (pending === undefined) {
    pending = loadCityRailStations(city).finally(() => {
      inFlight.delete(city.id)
    })
    inFlight.set(city.id, pending)
  }
  const result = await pending
  cache.set(city.id, result)
  return result
}
