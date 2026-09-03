import { NextResponse } from 'next/server'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { lineDetail } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

/**
 * Przebieg jednej linii w obu kierunkach (`/miasto/[city]/linia/[routeId]`).
 * `route` NIGDY nie trafia do wychodzącego URL-a — jest kluczem do naszej `Map`.
 * Realną granicą zaufania jest `lineDetail(...) === null → line: null` (200, nie
 * 400 — konwencja nieznanego ID z `/api/gtfs/board`); regex to tani strażnik.
 * `city` NATOMIAST musi być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const route = searchParams.get('route') ?? ''

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }
  if (!GTFS_ROUTE_ID_PATTERN.test(route)) {
    // Bez echa wartości wejściowej.
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator linii' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  const scheduleBlock = scheduleResponseBlock(poller.getView())

  if (schedule === null) {
    return NextResponse.json({ city, schedule: scheduleBlock, line: null, attribution: [] })
  }

  return NextResponse.json({
    city,
    schedule: scheduleBlock,
    line: lineDetail(schedule, route),
    attribution: schedule.attribution,
  })
}
