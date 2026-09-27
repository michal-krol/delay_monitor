import { NextResponse } from 'next/server'
import { getGtfsPoller, peekAlertPoller, peekVehiclePoller } from '@/lib/gtfs/instance'
import { mapCityVehicles } from '@/lib/gtfs/cityVehicles'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Pozycje WSZYSTKICH pojazdów miasta, surowe lat/lon (bez rzutu na trasę —
 * w odróżnieniu od `/api/gtfs/vehicles`). Zero nowych pobrań: te same dane co
 * `VehiclePoller` (mapa miasta live, podprojekt 3). Niezmiennik #13: ZERO pola
 * opóźnienia. `city` MUSI być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowe miasto' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }
  // fire-and-forget — NIGDY nie awaitujemy ładowania w handlerze.
  poller.ensureLoaded()

  const vehiclePoller = peekVehiclePoller(city)
  const feedView = vehiclePoller?.getView() ?? { state: 'loading', fetchedAt: null, ageMs: null }
  const schedule = poller.getSchedule()

  const vehicles =
    schedule !== null && vehiclePoller !== null ? mapCityVehicles(schedule, vehiclePoller.getPositions(), Date.now()) : []

  // Numery linii z aktywnym alertem — znaczek ⚠ i filtr na mapie. Pole pomocnicze:
  // `[]` także zanim AlertPoller jest gotowy (brak znaczka, nie „zero utrudnień", #13).
  const alertLines = [...new Set((peekAlertPoller(city)?.getAlerts() ?? []).flatMap((alert) => alert.routes))].sort()

  return NextResponse.json({
    city,
    vehicles,
    alertLines,
    feed: { fetchedAt: feedView.fetchedAt, ageMs: feedView.ageMs, state: feedView.state },
  })
}
