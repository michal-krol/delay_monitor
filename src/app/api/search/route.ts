import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { getCity } from '@/lib/gtfs/cities'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { groupLines, searchStops, stopGroup } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { CITY_ID_PATTERN } from '@/lib/validation'

const MAX_SUGGESTIONS = 10
const MAX_QUERY_LENGTH = 100
const MIN_QUERY_LENGTH = 3

/**
 * Wartości filtra `mode`. `rail` = stacje kolejowe PKP (nie GTFS `route_type=2`).
 * Chipy zawężające ruch miejski to `metro`/`tram`/`bus`; „kolej strefowa" (SKM,
 * GTFS `rail`) i `other` pokazują się tylko przy `all`.
 */
type SearchMode = 'all' | 'rail' | 'metro' | 'tram' | 'bus'
const TRANSIT_FILTER_MODES = new Set<SearchMode>(['metro', 'tram', 'bus'])

type SearchOption = {
  id: string
  name: string
  kind: 'rail' | 'transit'
  mode: GtfsMode
  modes?: GtfsMode[]
  lines?: { routeId: string; line: string; color: string | null; mode: GtfsMode }[]
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
  const modeParam = searchParams.get('mode') ?? 'all'

  if (!CITY_ID_PATTERN.test(cityId) || getCity(cityId) === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  const city = getCity(cityId)!

  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ stations: [] })
  }

  const mode: SearchMode =
    modeParam === 'rail' || TRANSIT_FILTER_MODES.has(modeParam as SearchMode) ? (modeParam as SearchMode) : 'all'

  const wantRail = mode === 'all' || mode === 'rail'
  const wantTransit = mode === 'all' || TRANSIT_FILTER_MODES.has(mode)

  const results: SearchOption[] = []

  // ── stacje kolejowe (prefiks nazwy miasta) ──────────────────────────────
  if (wantRail) {
    try {
      const stations = await client.searchStations(query)
      for (const station of stations) {
        if (station.name.startsWith(city.railStationPrefix)) {
          results.push({ id: station.id, name: station.name, kind: 'rail', mode: 'rail' })
        }
      }
    } catch {
      // Awaria słownika stacji nie wywala wyszukiwarki — miejskie mogą się udać.
    }
  }

  // ── zespoły przystankowe komunikacji miejskiej ─────────────────────────
  let scheduleLoading = false
  if (wantTransit) {
    const poller = getGtfsPoller(cityId)
    poller?.ensureLoaded()
    const schedule = poller?.getSchedule() ?? null
    scheduleLoading = schedule === null
    if (schedule !== null) {
      for (const hit of searchStops(schedule, query, MAX_SUGGESTIONS)) {
        const lines = groupLines(schedule, hit.id)
        const modes = stopGroup(schedule, hit.id)?.modes ?? []
        if (mode !== 'all' && !modes.includes(mode as GtfsMode)) continue
        results.push({
          id: hit.id,
          name: hit.name,
          kind: 'transit',
          mode: modes[0] ?? 'other',
          modes,
          lines,
        })
      }
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
  return NextResponse.json({ stations: results.slice(0, MAX_SUGGESTIONS), loading: scheduleLoading })
}
