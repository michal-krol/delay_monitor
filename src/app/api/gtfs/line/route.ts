import { NextResponse } from 'next/server'
import { getGtfsPoller, peekAlertPoller } from '@/lib/gtfs/instance'
import { knownAlerts } from '@/lib/gtfs/alertPoller'
import { toAlertFeedStatus } from '@/lib/gtfs/alertView'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { alertsForRoutes, lineDetail } from '@/lib/gtfs/query'
import { courseDetail, courseStopCounts, stopTimetable, timetableStop } from '@/lib/gtfs/courses'
import { CITY_ID_PATTERN, GTFS_DIRECTION_PATTERN, GTFS_ROUTE_ID_PATTERN, GTFS_STOP_ID_PATTERN, GTFS_TRIP_ID_PATTERN, isGtfsServiceDate } from '@/lib/validation'

/**
 * Przebieg jednej linii w obu kierunkach (`/city/[city]/line/[routeId]`).
 * `route` NIGDY nie trafia do wychodzącego URL-a — jest kluczem do naszej `Map`.
 * Realną granicą zaufania jest `lineDetail(...) === null → line: null` (200, nie
 * 400 — konwencja nieznanego ID z `/api/gtfs/board`); regex to tani strażnik.
 * `city` NATOMIAST musi być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const route = searchParams.get('route') ?? ''
  const trip = searchParams.get('trip')
  const date = searchParams.get('date')
  const stop = searchParams.get('stop')
  const dir = searchParams.get('dir')
  if ((trip !== null && (!GTFS_TRIP_ID_PATTERN.test(trip) || date === null || !isGtfsServiceDate(date))) || (date !== null && (trip === null || !isGtfsServiceDate(date))) || (stop !== null && !GTFS_STOP_ID_PATTERN.test(stop)) || (dir !== null && !GTFS_DIRECTION_PATTERN.test(dir))) {
    return NextResponse.json({ error: 'Nieprawidłowy wybór kursu lub przystanku' }, { status: 400 })
  }

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

  // `alerts: null` = jeszcze nie wiadomo — klient ponawia drabinką do skutku (#7). Definicja „znane"
  // (w tym `failed` -> lista, żeby nie odpytywać martwego feedu): `knownAlerts()`.
  // `alertFeed` = stan feedu dla UI (odróżnia awarię od pustego sukcesu); addytywne, `alerts` bez zmian.
  const alertPoller = peekAlertPoller(city)
  const allAlerts = knownAlerts(alertPoller)
  const alertFeed = toAlertFeedStatus(alertPoller?.getView())
  const routeIdx = schedule !== null ? schedule.routeIndexById.get(route) : undefined
  const alerts =
    allAlerts === null
      ? null
      : schedule !== null && routeIdx !== undefined
        ? alertsForRoutes(schedule, allAlerts, new Set([routeIdx]))
        : []

  if (schedule === null) {
    return NextResponse.json({ city, schedule: scheduleBlock, line: null, alerts, alertFeed, attribution: [] })
  }

  return NextResponse.json({
    city,
    schedule: scheduleBlock,
    line: lineDetail(schedule, route),
    supportsCourses: true,
    courseStopCounts: courseStopCounts(schedule, route),
    ...(trip !== null && date !== null ? { course: courseDetail(schedule, route, trip, date) } : {}),
    ...(stop !== null && dir !== null ? { timetable: stopTimetable(schedule, route, Number(dir), stop), timetableStop: timetableStop(schedule, route, Number(dir), stop) } : {}),
    alerts,
    alertFeed,
    attribution: schedule.attribution,
  })
}
