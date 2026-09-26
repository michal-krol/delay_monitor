import { NextResponse } from 'next/server'
import { poller } from '@/lib/board/instance'
import { getCity } from '@/lib/gtfs/cities'
import { resolveCityRailStations } from '@/lib/board/railStations'
import { getStationCoordinatesEntry, type StationCoordinatesEntry } from '@/lib/weather/coordinates'
import { CITY_ID_PATTERN } from '@/lib/validation'
import type { RealizationStatus } from '@/lib/board/realization'

type RailStationApiEntry = {
  id: string
  name: string
  lat: number
  lon: number
  coordSource: 'station' | 'osm-railway' | 'city-fallback'
  status: RealizationStatus | null
  nextDepartures: { plannedAt: string; headsign: string | null; delayMinutes: number | null; status: RealizationStatus }[] | null
  ageMs: number | null
}

/**
 * Warstwa stacji PKP na mapie miasta. WYŁĄCZNIE odczyt pamięci pollera
 * (`getSnapshot`) — nigdy `registerInterest` (decyzja brainstormingu
 * 2026-09-23: samo otwarcie mapy nie może wciągnąć dziesiątek stacji do
 * budżetu PKP, AGENTS.md #3).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const cityId = url.searchParams.get('city') ?? ''

  if (!CITY_ID_PATTERN.test(cityId)) {
    return NextResponse.json({ error: 'invalid city' }, { status: 400 })
  }
  const city = getCity(cityId)
  if (city === null) {
    return NextResponse.json({ error: 'unknown city' }, { status: 404 })
  }

  const stations = await resolveCityRailStations(city)
  const now = Date.now()

  const entries = await Promise.all(
    stations.map(async (station): Promise<RailStationApiEntry | null> => {
      const coords = await getStationCoordinatesEntry(station.id)
      if (coords === null || coords.lat === null || coords.lon === null) return null
      // `coords.source` może formalnie być `'failed'`, ale taki wpis ZAWSZE ma
      // `lat`/`lon: null` (`StationCoordinatesEntry`, `weather/coordinates.ts`) --
      // guard wyżej go już odsiał, więc to nie zgadywanie, tylko zawężenie typu
      // po fakcie. Bez ternary udającego realne mapowanie `'failed' → 'city-fallback'`,
      // którego ta gałąź nigdy nie wykonuje.
      const coordSource = coords.source as Exclude<StationCoordinatesEntry['source'], 'failed'>

      const snapshot = poller.getSnapshot(station.id)
      if (snapshot === undefined) {
        return { id: station.id, name: station.name, lat: coords.lat, lon: coords.lon, coordSource, status: null, nextDepartures: null, ageMs: null }
      }

      const upcoming = snapshot.departures.filter((row) => Date.parse(row.plannedAt) >= now).slice(0, 3)
      const status: RealizationStatus = upcoming[0]?.status ?? 'unknown'

      return {
        id: station.id,
        name: station.name,
        lat: coords.lat,
        lon: coords.lon,
        coordSource,
        status,
        nextDepartures: upcoming.map((row) => ({ plannedAt: row.plannedAt, headsign: row.headsign, delayMinutes: row.delayMinutes, status: row.status })),
        ageMs: now - Date.parse(snapshot.fetchedAt),
      }
    })
  )

  return NextResponse.json({ stations: entries.filter((entry): entry is RailStationApiEntry => entry !== null) })
}
