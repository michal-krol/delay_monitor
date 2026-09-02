import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { allCities } from '@/lib/gtfs/cities'
import { enabledGtfsCities } from '@/lib/gtfs/instance'

/**
 * Rejestr miast dla przełącznika kontekstu + stacje kolejowe PKP należące do
 * każdego miasta. Przynależność bierzemy z PREFIKSU nazwy (`railStationPrefix`
 * z `CityFeed`) — żadnej geometrii, żadnego parowania stacji z przystankami
 * (decyzja użytkownika).
 *
 * `searchStations` czyta pełny słownik stacji (cache 24 h w live, fixture
 * w mock), więc to nie jest dodatkowe zapytanie poza pierwszym rozgrzaniem.
 * Awaria słownika renderuje się jako „brak stacji kolejowych", nie jako błąd.
 */
export async function GET() {
  const gtfsEnabled = new Set(enabledGtfsCities().map((city) => city.id))

  const cities = await Promise.all(
    allCities().map(async (city) => {
      let railStations: { id: string; name: string }[] = []
      try {
        const matches = await client.searchStations(city.name)
        railStations = matches
          .filter((station) => station.name.startsWith(city.railStationPrefix))
          .map((station) => ({ id: station.id, name: station.name }))
      } catch {
        railStations = []
      }
      return {
        id: city.id,
        name: city.name,
        timezone: city.timezone,
        hasTransit: gtfsEnabled.has(city.id),
        railStations,
      }
    })
  )

  return NextResponse.json({ cities })
}
