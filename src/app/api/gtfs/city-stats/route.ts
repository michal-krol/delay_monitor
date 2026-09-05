import { NextResponse } from 'next/server'
import { serviceDateWindow } from '@/lib/pkp/time'
import { getCity } from '@/lib/gtfs/cities'
import { getGtfsPoller, peekAlertPoller, peekVehiclePoller } from '@/lib/gtfs/instance'
import { cityStats, vehiclesInService } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Statystyki komunikacji miejskiej miasta dla widżetu sieci — wszystko
 * z rozkładu, zero pozycji pojazdów. `state: 'loading'` dopóki poller nie ma
 * rozkładu; hook ponawia (jak `useTransitBoard`).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''

  if (!CITY_ID_PATTERN.test(city) || getCity(city) === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  const view = poller.getView()

  // Pozycje pojazdów (etap 5) — poza cyklem rozkładu, własny rytm. `null`
  // (nie obiekt zer) dopóki poller nieobecny albo nie `ready` (niezmiennik #7).
  const vehiclePoller = peekVehiclePoller(city)
  const vv = vehiclePoller?.getView()
  const ready = schedule !== null && vehiclePoller !== null && vv?.state === 'ready'
  const inService = ready ? vehiclesInService(schedule, vehiclePoller.getPositions()) : null
  const vehicleFields = {
    vehiclesInService: inService?.counts ?? null,
    vehiclesUnmatched: inService?.unmatched ?? null,
    vehicleFeed: { state: vv?.state ?? 'loading', ageMs: vv?.ageMs ?? null },
  }

  // Alerty (etap 5b) — poza cyklem rozkładu, własny rytm 5 min. `null` (nie
  // pusta tablica) dopóki poller nieobecny albo nie `ready` — to JEDYNE
  // miejsce, gdzie „0 aktywnych" i „nie wiadomo" muszą się wizualnie różnić
  // (kafelek liczbowy, #7). `line`/`board` zwracają `[]` w tej sytuacji —
  // tam pusta lista nic nie kłamie, bo baner po prostu się nie renderuje.
  const alertPoller = peekAlertPoller(city)
  const ap = alertPoller?.getView()
  const alertsReady = alertPoller !== null && ap?.state === 'ready'
  const alertFields = {
    alerts: alertsReady ? alertPoller.getAlerts() : null,
    alertFeed: { state: ap?.state ?? 'loading', ageMs: ap?.ageMs ?? null },
  }

  if (schedule === null) {
    return NextResponse.json({ city, state: view.state, stats: null, ...vehicleFields, ...alertFields })
  }

  const timezone = getCity(city)!.timezone
  const today = serviceDateWindow(new Date(), timezone)[1]
  const todayIndex = Math.max(0, schedule.serviceDates.indexOf(today))

  return NextResponse.json({
    city,
    state: 'ready' as const,
    stats: cityStats(schedule, todayIndex),
    ...vehicleFields,
    ...alertFields,
  })
}
