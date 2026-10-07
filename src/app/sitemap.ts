import type { MetadataRoute } from 'next'
import { allCities } from '@/lib/gtfs/cities'
import { publicBaseUrl } from '@/lib/share/metadata'
import { STATION_ID_PATTERN } from '@/lib/validation'
import { getAllStationIds } from '@/lib/weather/coordinates'

// Domena z env w czasie żądania, nie budowania: statyczny prerender zamroziłby adres sprzed ustawienia `RAILWAY_PUBLIC_DOMAIN`.
export const dynamic = 'force-dynamic'

/** Limit protokołu sitemap.xml — przy większym słowniku obcinamy, zamiast oddać plik odrzucany przez roboty. */
const MAX_URLS = 50_000
/** Bez `RAILWAY_PUBLIC_DOMAIN` (lokalnie) sitemap i tak musi mieć adresy bezwzględne. */
const FALLBACK_BASE = 'http://localhost:3000'

/**
 * Strona główna, ekrany miast (odjazdy, linie, mapa) i tablica każdej stacji ze STATYCZNEGO słownika
 * (`data/station-coordinates.json`). Zero zapytań do PKP (#3) i do feedów GTFS: pojedyncze linie i
 * przystanki wymagałyby wczytanego rozkładu, więc zostają poza mapą (dojście przez `/city/<miasto>/lines`).
 * Baza adresu z tego samego źródła co `metadataBase` (`publicBaseUrl`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicBaseUrl() ?? new URL(FALLBACK_BASE)
  const url = (path: string) => new URL(path, base).toString()

  const cityPaths = allCities().flatMap((city) => [`/city/${city.id}`, `/city/${city.id}/lines`, `/city/${city.id}/map`])
  // Identyfikatory z pliku też traktujemy jak dane z zewnątrz (#4): do adresu trafia tylko to, co pasuje do wzorca.
  const stationPaths = (await getAllStationIds()).filter((id) => STATION_ID_PATTERN.test(id)).map((id) => `/station/${id}`)

  return ['/', ...cityPaths, ...stationPaths].slice(0, MAX_URLS).map((path) => ({ url: url(path) }))
}
