import { NextResponse } from 'next/server'
import { getGtfsPoller, peekVehiclePoller } from '@/lib/gtfs/instance'
import { projectTripVehicle, projectVehicle } from '@/lib/gtfs/vehicleProject'
import { courseVehicleAtStop, observedTripCourse } from '@/lib/gtfs/vehicleStatus'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN, GTFS_TRIP_ID_PATTERN, GTFS_STOP_ID_PATTERN, GTFS_SEQUENCE_PATTERN, isGtfsServiceDate } from '@/lib/validation'

/**
 * Pozycje pojazdów JEDNEJ linii i kierunku, rzutowane na sekwencję przystanków
 * przebiegu (`projectVehicle`). Bez minut opóźnienia i ETA; stan ADR0014 jest
 * wnioskiem aplikacji, nie realizacją z feedu. `route` nigdy nie trafia do wychodzącego URL-a (klucz do `Map`); regex
 * to strażnik formatu, realną granicą jest brak dopasowania → `vehicles: []`.
 * `city` MUSI być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const route = searchParams.get('route') ?? ''
  const directionRaw = searchParams.get('direction') ?? ''
  const trip = searchParams.get('trip')
  const stop = searchParams.get('stop')
  const sequence = searchParams.get('seq')
  const date = searchParams.get('date')
  if ((stop !== null && !GTFS_STOP_ID_PATTERN.test(stop)) || (sequence !== null && (!GTFS_SEQUENCE_PATTERN.test(sequence) || Number(sequence) > 65535)) || (date !== null && !isGtfsServiceDate(date))) return NextResponse.json({ error: 'Nieprawidłowy wybór przystanku lub daty' }, { status: 400 })
  if (trip !== null && !GTFS_TRIP_ID_PATTERN.test(trip)) return NextResponse.json({ error: 'Nieprawidłowy kurs' }, { status: 400 })

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowe miasto' }, { status: 400 })
  }
  if (!GTFS_ROUTE_ID_PATTERN.test(route)) {
    return NextResponse.json({ error: 'Nieprawidłowa linia' }, { status: 400 })
  }
  if (directionRaw !== '0' && directionRaw !== '1') {
    return NextResponse.json({ error: 'Nieprawidłowy kierunek' }, { status: 400 })
  }
  const direction = directionRaw === '1' ? 1 : 0

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  // fire-and-forget — NIGDY nie awaitujemy ładowania w handlerze.
  poller.ensureLoaded()

  const vehiclePoller = peekVehiclePoller(city)
  const feedView = vehiclePoller?.getView() ?? { state: 'loading', fetchedAt: null, ageMs: null }
  const schedule = poller.getSchedule()

  let vehicles: ReturnType<typeof projectVehicle>[] = []
  if (schedule !== null && vehiclePoller !== null) {
    const routeIdx = schedule.routeIndexById.get(route)
    if (routeIdx !== undefined) {
      const now = Date.now()
      // Pre-filtr po `routeIdx` (klucz w pamięci) zanim `projectVehicle` policzy
      // rzut na trasę — ~1,5 tys. pozycji miasta, z których jedna linia to ~1%.
      vehicles = vehiclePoller
        .getPositions()
        .filter((p) => schedule.tripPatternRef.get(p.tripId)?.routeIdx === routeIdx && (trip === null || p.tripId === trip))
        .map((p) => {
          const projected = trip === null ? projectVehicle(schedule, p, now) : projectTripVehicle(schedule, p, now)
          if (projected === null) return null
          const course = observedTripCourse(schedule, p, date ?? undefined)
          if (trip !== null && date !== null && course === null) return null
          const status = courseVehicleAtStop(schedule, p, now, { serviceDate: date ?? undefined, stopId: stop ?? undefined, sequence: sequence === null ? undefined : Number(sequence) })
          return { ...projected, id: p.id, observedAt: p.timestamp, serviceDate: course?.serviceDate, pastScheduledDeparture: status?.pastScheduledDeparture ?? false }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null && v.directionId === direction)
    }
  }

  return NextResponse.json({
    city,
    route,
    direction,
    vehicles,
    feed: { fetchedAt: feedView.fetchedAt, ageMs: feedView.ageMs, state: feedView.state },
  })
}
