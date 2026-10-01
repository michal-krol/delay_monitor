import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { getCity } from '@/lib/gtfs/cities'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { groupCentroid, groupLines, searchStops, stopGroup, type GtfsLine } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'
import { getStationCoordinates } from '@/lib/weather/coordinates'

const MAX_SUGGESTIONS = 10
const MAX_QUERY_LENGTH = 100
const MIN_QUERY_LENGTH = 3

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
 * naszej `Map`. `city` MUSI być sprawdzone wobec rejestru: wybiera feed. Bez
 * echa wartości wejściowej w błędach (AGENTS.md #4).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cityId = searchParams.get('city') ?? ''
  const query = (searchParams.get('q') ?? '').trim()
  // Mapa transportu pokazuje kolej z całej Polski — tam szukamy stacji bez filtra prefiksu miasta.
  const allRail = searchParams.get('rail') === 'all'

  if (!CITY_ID_PATTERN.test(cityId) || getCity(cityId) === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  const city = getCity(cityId)!

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ stations: [] })
  }

  const results: SearchOption[] = []

  // ── stacje kolejowe (prefiks nazwy miasta) ──────────────────────────────
  try {
    const stations = await client.searchStations(query)
    for (const station of stations) {
      if (allRail || station.name.startsWith(city.railStationPrefix)) {
        // Brak/awaria pliku współrzędnych nie wywala wyszukiwarki — wynik bez pozycji.
        const coords = await getStationCoordinates(station.id).catch(() => null)
        results.push({ id: station.id, name: station.name, kind: 'rail', mode: 'rail', ...coords })
      }
    }
  } catch {
    // Awaria słownika stacji nie wywala wyszukiwarki — miejskie mogą się udać.
  }

  // ── zespoły przystankowe komunikacji miejskiej ─────────────────────────
  const poller = getGtfsPoller(cityId)
  poller?.ensureLoaded()
  const schedule = poller?.getSchedule() ?? null
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
  const needle = query.toLocaleLowerCase('pl')
  results.sort((a, b) => {
    const ap = a.name.toLocaleLowerCase('pl').startsWith(needle) ? 0 : 1
    const bp = b.name.toLocaleLowerCase('pl').startsWith(needle) ? 0 : 1
    return ap - bp || a.name.localeCompare(b.name, 'pl')
  })

  // `loading` mówi wyszukiwarce, żeby ponowiła — rozkład miejski jeszcze się
  // wczytuje, więc same stacje kolejowe to niepełny wynik.
  return NextResponse.json({ stations: results.slice(0, MAX_SUGGESTIONS), loading: schedule === null })
}
