import type { CityFeed } from '@/lib/gtfs/cities'
import { client } from './instance'

/**
 * Stacje PKP należące do miasta, po prefiksie nazwy (`city.railStationPrefix`).
 * Wydzielone z `/api/cities/route.ts`, żeby `/api/rail-stations` reużywało
 * dokładnie tę samą regułę zamiast drugiej kopii filtra.
 */
export async function resolveCityRailStations(city: CityFeed): Promise<{ id: string; name: string }[]> {
  try {
    const matches = await client.searchStations(city.name)
    return matches.filter((station) => station.name.startsWith(city.railStationPrefix)).map((station) => ({ id: station.id, name: station.name }))
  } catch {
    return []
  }
}
