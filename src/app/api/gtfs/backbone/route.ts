import { NextResponse } from 'next/server'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { backboneLines } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Przebiegi metra i kolei miejskiej — tło orientacyjne mapy transportu. Z pamięci
 * rozkładu, zero nowych pobrań. `lines: null` dopóki rozkład się wczytuje.
 * Zmienia się tylko z feedem → cache przeglądarki 1 h.
 */
export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get('city') ?? ''
  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }
  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  if (schedule === null) return NextResponse.json({ lines: null })
  return NextResponse.json({ lines: backboneLines(schedule) }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
