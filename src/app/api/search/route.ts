import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { getCity, type CityFeed } from '@/lib/gtfs/cities'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { groupCentroid, groupLines, searchStops, stopGroup, type GtfsLine } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'
import { getStationCoordinates } from '@/lib/weather/coordinates'

const MAX_SUGGESTIONS = 10
const MAX_QUERY_LENGTH = 100
const MIN_QUERY_LENGTH = 3

type SearchSources = {
  trains: 'ready' | 'unavailable'
  rail: 'ready' | 'failed'
  transit: 'ready' | 'loading' | 'failed' | 'disabled'
}

type SearchOption = {
  id: string
  name: string
  kind: 'rail' | 'transit'
  mode: GtfsMode
  modes?: GtfsMode[]
  lines?: GtfsLine[]
  /** Cel `flyTo` na mapie: kolej z `station-coordinates.json`, zespół = środek przystanków. Brak = nieznana pozycja. */
  lat?: number
  lon?: number
}

/**
 * Jedna wyszukiwarka ekranu Odjazdy/Przyjazdy — stacje kolejowe PKP z tego
 * miasta ORAZ zespoły przystankowe komunikacji miejskiej, w jednej kopercie
 * `{ stations }` (kształt, którego `StationSearch` już oczekuje).
 *
 * Identyfikator GTFS nigdy nie trafia do wychodzącego URL-a — jest kluczem do
 * naszej `Map`. `city` jest opcjonalne: brak = wyszukiwanie tylko stacji PKP z
 * całej Polski (jak `rail=all`), komunikacja miejska wyłączona. Podane `city`
 * MUSI być sprawdzone wobec rejestru (wybiera feed) — puste, niepoprawne lub
 * nieznane to 400, bez echa wartości wejściowej (AGENTS.md #4).
 *
 * `sources` mówi klientowi, które źródło zawiodło lub jeszcze się wczytuje
 * (addytywnie — `stations` i `loading` znaczą to, co dawniej). Zero nowych
 * wywołań upstream: stan GTFS to odczyt z pamięci pollera.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cityParam = searchParams.get('city')
  const query = (searchParams.get('q') ?? '').trim()
  // Mapa transportu pokazuje kolej z całej Polski — tam szukamy stacji bez filtra prefiksu miasta.
  const allRailParam = searchParams.get('rail') === 'all'

  let city: CityFeed | null = null
  if (cityParam !== null) {
    city = CITY_ID_PATTERN.test(cityParam) ? getCity(cityParam) : null
    if (city === null) {
      return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
    }
  }
  const allRail = allRailParam || city === null

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    const sources: SearchSources = { rail: 'ready', transit: city === null ? 'disabled' : 'ready', trains: 'ready' }
    return NextResponse.json({ stations: [], trains: [], sources })
  }

  const needle = query.toLocaleLowerCase('pl')
  const trainSearch = client.searchCachedTrains(query)
  const compareByQuery = (a: { name: string }, b: { name: string }) => {
    const ap = a.name.toLocaleLowerCase('pl').startsWith(needle) ? 0 : 1
    const bp = b.name.toLocaleLowerCase('pl').startsWith(needle) ? 0 : 1
    return ap - bp || a.name.localeCompare(b.name, 'pl')
  }
  const results: SearchOption[] = []
  let railState: SearchSources['rail'] = 'ready'

  // ── stacje kolejowe (prefiks nazwy miasta) ──────────────────────────────
  try {
    const stations = await client.searchStations(query)
    const matching = stations.filter(
      (station) => allRail || (city !== null && station.name.startsWith(city.railStationPrefix))
    )
    // Tylko tyle, ile i tak zmieści się w odpowiedzi -- bez `await` współrzędnych dla reszty.
    // Słownik zwraca trafienia w kolejności katalogu, więc najpierw porządek jak w końcowym
    // sortowaniu (prefiks, potem alfabet) -- inaczej cięcie gubiłoby lepsze trafienia.
    matching.sort(compareByQuery)
    for (const station of matching.slice(0, MAX_SUGGESTIONS)) {
      // Brak/awaria pliku współrzędnych nie wywala wyszukiwarki — wynik bez pozycji.
      const coords = await getStationCoordinates(station.id).catch(() => null)
      results.push({ id: station.id, name: station.name, kind: 'rail', mode: 'rail', ...coords })
    }
  } catch {
    // Awaria słownika stacji nie wywala wyszukiwarki — miejskie mogą się udać.
    // Zapisujemy ją w `sources`, żeby klient nie pokazał „Brak wyników” przy awarii.
    railState = 'failed'
  }

  // ── zespoły przystankowe komunikacji miejskiej (tylko z podanym miastem) ─
  const poller = city === null ? null : getGtfsPoller(city.id)
  poller?.ensureLoaded()
  const schedule = poller?.getSchedule() ?? null
  let transitState: SearchSources['transit'] = 'disabled'
  if (city !== null) {
    transitState =
      schedule !== null ? 'ready' : poller === null || poller.getView().state === 'failed' ? 'failed' : 'loading'
  }
  if (schedule !== null) {
    for (const hit of searchStops(schedule, query, MAX_SUGGESTIONS)) {
      const modes = stopGroup(schedule, hit.id)?.modes ?? []
      results.push({
        id: hit.id,
        name: hit.name,
        kind: 'transit',
        mode: modes[0] ?? 'other',
        modes,
        lines: groupLines(schedule, hit.id),
        ...groupCentroid(schedule, hit.id),
      })
    }
  }

  // Dopasowania od początku nazwy pierwsze, potem alfabetycznie.
  results.sort(compareByQuery)

  // `loading` mówi wyszukiwarce, żeby ponowiła — rozkład miejski jeszcze się
  // wczytuje, więc same stacje kolejowe to niepełny wynik. Bez miasta nie ma
  // czego wczytywać (`false`).
  return NextResponse.json({
    stations: results.slice(0, MAX_SUGGESTIONS),
    trains: trainSearch.trains,
    loading: city !== null && schedule === null,
    sources: { rail: railState, transit: transitState, trains: trainSearch.state } satisfies SearchSources,
  })
}
