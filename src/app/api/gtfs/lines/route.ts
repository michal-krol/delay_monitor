import { NextResponse } from 'next/server'
import { getGtfsPoller } from '@/lib/gtfs/instance'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { allLines } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Wszystkie linie miasta, pogrupowane po rodzaju — przeglądarka „Trasy".
 * `city` MUSI być sprawdzone wobec rejestru (wybiera feed). `lines: null`
 * dopóki rozkład się wczytuje — klient ponawia.
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
    return NextResponse.json({ city, schedule: scheduleBlock, lines: null, attribution: [] })
  }

  return NextResponse.json({
    city,
    schedule: scheduleBlock,
    lines: allLines(schedule),
    attribution: schedule.attribution,
  })
}
