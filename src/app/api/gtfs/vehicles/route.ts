import { NextResponse } from 'next/server'
import { getGtfsPoller, peekVehiclePoller } from '@/lib/gtfs/instance'
import { projectVehicle } from '@/lib/gtfs/vehicleProject'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

/**
 * Pozycje pojazdów JEDNEJ linii i kierunku, rzutowane na sekwencję przystanków
 * przebiegu (`projectVehicle`). Niezmiennik #13: ZERO pola opóźnienia — feed go
 * nie ma. `route` nigdy nie trafia do wychodzącego URL-a (klucz do `Map`); regex
 * to strażnik formatu, realną granicą jest brak dopasowania → `vehicles: []`.
 * `city` MUSI być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const route = searchParams.get('route') ?? ''
  const directionRaw = searchParams.get('direction') ?? ''

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
    const now = Date.now()
    vehicles = vehiclePoller
      .getPositions()
      .map((p) => projectVehicle(schedule, p, now))
      .filter(
        (v): v is NonNullable<typeof v> => v !== null && v.routeId === route && v.directionId === direction
      )
  }

  return NextResponse.json({
    city,
    route,
    direction,
    vehicles,
    feed: { fetchedAt: feedView.fetchedAt, ageMs: feedView.ageMs, state: feedView.state },
  })
}
