import { NextResponse } from 'next/server'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { cityStops } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Wszystkie przystanki miasta z pozycją — warstwa przystanków mapy miasta.
 * Zero nowych pobrań: `stops.txt` już siedzi w pamięci rozkładu. `stops: null`
 * dopóki rozkład się wczytuje — klient ponawia (jak `/api/gtfs/lines`).
 * Wynik zmienia się tylko przy przeładowaniu feedu → cache przeglądarki 1 h.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  const scheduleBlock = scheduleResponseBlock(poller.getView())

  if (schedule === null) {
    return NextResponse.json({ city, schedule: scheduleBlock, stops: null, attribution: [] })
  }

  return NextResponse.json(
    { city, schedule: scheduleBlock, stops: cityStops(schedule), attribution: schedule.attribution },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  )
}
