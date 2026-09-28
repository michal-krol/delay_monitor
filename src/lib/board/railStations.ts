import type { CityFeed } from '@/lib/gtfs/cities'
import { createTtlCache } from '@/lib/cache'
import { client } from './instance'

export type CityRailStation = { id: string; name: string }

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 50

const cache = createTtlCache<CityRailStation[] | null>({ ttlMs: CACHE_TTL_MS, maxEntries: CACHE_MAX_ENTRIES })

/**
 * Uchwyty na trwające wyszukania, tak samo jak `inFlight` w `/api/train/route.ts`
 * -- cache sprawdzany przed `await` i zapisywany po nim jest wyścigiem
 * (AGENTS.md #4): kilka otwartych kart mapy pollujących `/api/rail-stations`
 * dla tego samego miasta w tej samej chwili odpaliłoby każda swoje własne
 * `searchStations`.
 */
const inFlight = new Map<string, Promise<CityRailStation[] | null>>()

/** `null` = wyszukanie w słowniku stacji zawiodło (nieznane, nie „zero stacji", AGENTS.md #7). */
async function loadCityRailStations(city: CityFeed): Promise<CityRailStation[] | null> {
  try {
    const matches = await client.searchStations(city.name)
    return matches.filter((station) => station.name.startsWith(city.railStationPrefix)).map((station) => ({ id: station.id, name: station.name }))
  } catch {
    return null
  }
}

/**
 * Stacje PKP należące do miasta, po prefiksie nazwy (`city.railStationPrefix`).
 * Jedyny wywołujący to `/api/cities/route.ts` (rejestr miast na pickerze
 * Odjazdy/Przyjazdy) -- wydzielone do własnego modułu, żeby domenowa reguła
 * filtra (prefiks nazwy) była w jednym miejscu, nie w handlerze trasy.
 *
 * Cache'owane 10 min, PER MIASTO -- także wynik awarii wyszukania (`catch`
 * powyżej), jako `null` (nie `[]` -- AGENTS.md #7, „nieznane" ≠ „zero").
 * `/api/cities` jest wołane raz na wczytanie strony, ale przez KAŻDĄ otwartą
 * kartę/zakładkę (mnogość klientów w tym samym oknie 10 min), więc bez tej
 * negatywnej pamięci sustained awaria słownika stacji PKP (`fetchAllStations()`
 * w `pkp/client.ts` samo nie ma negatywnego cache'u) powtarzałaby próbę
 * `searchStations` przy każdym takim wczytaniu zamiast raz na 10 minut --
 * AGENTS.md #3.
 */
export async function resolveCityRailStations(city: CityFeed): Promise<CityRailStation[] | null> {
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
