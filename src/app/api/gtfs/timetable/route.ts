import { NextResponse } from 'next/server'
import { getCity } from '@/lib/gtfs/cities'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { dayTimetable } from '@/lib/gtfs/query'
import { serviceDateWindow } from '@/lib/pkp/time'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN, GTFS_STOP_ID_PATTERN } from '@/lib/validation'

const DAY_OFFSET: Record<string, number> = { yesterday: -1, today: 0, tomorrow: 1 }

/**
 * Pełna tabliczka dobowa dla pary (przystanek, linia). `stop`/`route` NIGDY
 * nie trafiają do wychodzącego URL-a — klucze do naszych `Map`. `day`
 * (`yesterday`/`today`/`tomorrow`, domyślnie `today`) wybiera dobę z okna
 * rozkładu. `city` sprawdzone wobec rejestru.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const stop = searchParams.get('stop') ?? ''
  const route = searchParams.get('route') ?? ''
  const day = searchParams.get('day') ?? 'today'

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }
  if (!GTFS_STOP_ID_PATTERN.test(stop) || !GTFS_ROUTE_ID_PATTERN.test(route)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator' }, { status: 400 })
  }
  if (!(day in DAY_OFFSET)) {
    return NextResponse.json({ error: 'Nieprawidłowa doba' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  const scheduleBlock = scheduleResponseBlock(poller.getView())

  if (schedule === null) {
    return NextResponse.json({ city, schedule: scheduleBlock, entries: [] })
  }

  const timezone = getCity(city)?.timezone ?? 'Europe/Warsaw'
  const today = serviceDateWindow(new Date(), timezone)[1]
  const todayIndex = schedule.serviceDates.indexOf(today) === -1 ? 1 : schedule.serviceDates.indexOf(today)
  const dayIndex = Math.max(0, Math.min(2, todayIndex + DAY_OFFSET[day]))

  return NextResponse.json({
    city,
    schedule: scheduleBlock,
    serviceDate: schedule.serviceDates[dayIndex],
    entries: dayTimetable(schedule, stop, route, dayIndex),
  })
}
