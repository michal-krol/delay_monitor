import { NextResponse } from 'next/server'
import { client } from '@/lib/board/instance'
import { allCities } from '@/lib/gtfs/cities'
import { enabledGtfsCities, peekGtfsPoller } from '@/lib/gtfs/instance'
import { linesByMode } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'

/**
 * Rejestr miast dla pickera na ekranie Odjazdy/Przyjazdy + stacje kolejowe PKP
 * należące do każdego miasta (z PREFIKSU nazwy `railStationPrefix` — żadnej
 * geometrii, żadnego parowania stacji z przystankami). Dokłada też lekkie
 * podsumowanie rozkładu miejskiego dla paska informacji (`CitySummary`).
 *
 * `searchStations` czyta pełny słownik stacji (cache 24 h w live, fixture
 * w mock). `peekGtfsPoller` NIE tworzy pollera — jeśli miasto nie było jeszcze
 * oglądane, pola rozkładu są `null`/`0` (nigdy `0` jako „nie wiadomo").
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

      const poller = peekGtfsPoller(city.id)
      const schedule = poller?.getSchedule() ?? null
      const view = poller?.getView() ?? null

      let lineCounts: Record<GtfsMode, number> | null = null
      let stopGroupCount: number | null = null
      if (schedule !== null) {
        const byMode = linesByMode(schedule)
        lineCounts = { metro: byMode.metro.length, tram: byMode.tram.length, bus: byMode.bus.length, rail: byMode.rail.length, other: byMode.other.length }
        stopGroupCount = schedule.groupMembers.size
      }

      return {
        id: city.id,
        name: city.name,
        timezone: city.timezone,
        hasTransit: gtfsEnabled.has(city.id),
        railStations,
        schedule:
          view === null
            ? { state: 'idle' as const, ageMs: null, feedVersion: null, serviceDates: null }
            : { state: view.state, ageMs: view.ageMs, feedVersion: view.feedVersion, serviceDates: view.serviceDates },
        lineCounts,
        stopGroupCount,
      }
    })
  )

  return NextResponse.json({ cities })
}
