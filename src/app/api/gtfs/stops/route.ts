import { NextResponse } from 'next/server'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { searchStops } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN } from '@/lib/validation'

const MAX_SUGGESTIONS = 10
const MAX_QUERY_LENGTH = 100

/**
 * Wyszukiwarka ZESPOŁÓW przystankowych (nie słupków) — kształt `{ stations }`
 * wpada wprost w istniejący `StationSearch` (prop `endpoint`).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const query = (searchParams.get('q') ?? '').trim()

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }
  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  if (query === '' || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ stations: [] })
  }

  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  if (schedule === null) {
    // Rozkład jeszcze się ładuje — pusto, nie błąd. Hook StationSearch ponowi.
    return NextResponse.json({ stations: [] })
  }

  return NextResponse.json({ stations: searchStops(schedule, query, MAX_SUGGESTIONS) })
}
