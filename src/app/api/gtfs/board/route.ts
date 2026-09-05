import { NextResponse } from 'next/server'
import { serviceDateWindow } from '@/lib/pkp/time'
import { getCity } from '@/lib/gtfs/cities'
import { getGtfsPoller, peekAlertPoller, peekVehiclePoller } from '@/lib/gtfs/instance'
import { scheduleResponseBlock } from '@/lib/gtfs/poller'
import { alertsForRoutes, nextDepartures, stopGroup, stopSummary, vehicleForStop } from '@/lib/gtfs/query'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN } from '@/lib/validation'

/** Przeniesione z `/api/board`: realny użytkownik obserwuje kilka przystanków. */
const MAX_STOPS = 20
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * W ODRÓŻNIENIU od PKP identyfikator GTFS nigdy nie trafia do wychodzącego
 * URL-a — jest wyłącznie kluczem do naszej `Map`. Realną granicą zaufania jest
 * `stopGroup(...) === null → null` w odpowiedzi; regex to tani strażnik formatu.
 * `city` NATOMIAST musi być sprawdzone wobec rejestru — wybiera feed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') ?? ''
  const stopsParam = searchParams.get('stops') ?? ''

  if (!CITY_ID_PATTERN.test(city)) {
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator miasta' }, { status: 400 })
  }

  const poller = getGtfsPoller(city)
  if (poller === null) {
    return NextResponse.json({ error: 'Nieznane miasto' }, { status: 400 })
  }

  const rawIds = stopsParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
  if (rawIds.length === 0) {
    return NextResponse.json({ error: 'Brak parametru stops' }, { status: 400 })
  }
  if (rawIds.length > MAX_STOPS) {
    return NextResponse.json({ error: `Za dużo przystanków naraz (maksymalnie ${MAX_STOPS})` }, { status: 400 })
  }
  if (rawIds.some((id) => !GTFS_STOP_ID_PATTERN.test(id))) {
    // Bez echa wartości wejściowej.
    return NextResponse.json({ error: 'Nieprawidłowy identyfikator przystanku' }, { status: 400 })
  }
  const stopIds = [...new Set(rawIds)]

  const limitParam = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT

  // fire-and-forget — NIGDY nie awaitujemy ładowania w handlerze.
  poller.ensureLoaded()
  const schedule = poller.getSchedule()
  const view = poller.getView()

  const scheduleBlock = scheduleResponseBlock(view)

  if (schedule === null) {
    return NextResponse.json({ city, schedule: scheduleBlock, stops: [], attribution: [] })
  }

  const now = Date.now()
  // Indeks doby „dziś" w oknie [wczoraj, dziś, jutro] — do podsumowania stopu.
  const todayIndex = (() => {
    const timezone = getCity(city)?.timezone ?? 'Europe/Warsaw'
    const today = serviceDateWindow(new Date(now), timezone)[1]
    return schedule.serviceDates.indexOf(today) === -1 ? 1 : schedule.serviceDates.indexOf(today)
  })()

  // Opcjonalne zawężenie do jednego słupka zespołu (Centrum 01 vs Centrum 02).
  const rawSlupek = searchParams.get('slupek')
  const slupek = rawSlupek !== null && GTFS_STOP_ID_PATTERN.test(rawSlupek) ? rawSlupek : null

  // Pozycje pojazdów — poza cyklem pollera (raz na dobę + TTL, patrz #13); tu
  // tylko czytamy to, co ma w ręku. `VehiclePoller.getPositions()` sam trzyma
  // niezmiennik #7: `[]` dopóki nie ma pierwszego udanego pobrania, ostatnie
  // znane pozycje przy `'failed'` (nigdy pusto po sukcesie). Bez własnej bramki
  // stanu tutaj — jak `/api/gtfs/vehicles`. Tag „za przystankiem" bywa wtedy
  // przeterminowany; ta odpowiedź nie niesie wieku feedu pozycji — sygnałem
  // świeżości jest wiek `schedule`.
  const vehiclePoller = peekVehiclePoller(city)
  const positions = vehiclePoller?.getPositions() ?? []

  const alertPoller = peekAlertPoller(city)
  const allAlerts = alertPoller?.getAlerts() ?? []

  const stops = stopIds.map((id) => {
    const group = stopGroup(schedule, id)
    if (group === null) return null
    // Zawężenie do jednego słupka WYŁĄCZNIE przez jawny `?slupek=`. Klient
    // (TransitStopDetail) inicjuje go z `requestedMember`, ale sam steruje
    // przełącznikiem — inaczej „Cały przystanek" nie działałby na deep-linku.
    const scopeId = slupek !== null && group.members.some((m) => m.id === slupek) ? slupek : null
    const summary = stopSummary(schedule, scopeId ?? group.id, todayIndex)
    const groupRouteIdxs = schedule.groupRoutes.get(scopeId ?? group.id) ?? new Set<number>()
    const alerts = alertsForRoutes(schedule, allAlerts, groupRouteIdxs)
    // Indeks obserwowanego przystanku w przebiegu — do policzenia „ile przystanków
    // stąd" jest pojazd. `undefined` (pytano o cały zespół, nie o słupek) → brak tagu.
    const scopeStopIdx = schedule.stopIndexById.get(scopeId ?? group.id)
    const departures = nextDepartures(schedule, [scopeId ?? group.id], now, limit).map((d) => ({
      ...d,
      vehicle:
        positions.length > 0 && scopeStopIdx !== undefined
          ? vehicleForStop(schedule, positions, d.tripId, scopeStopIdx, now)
          : null,
    }))
    return {
      stopId: id,
      /** Id zespołu (gdy pytano o słupek, `stopId` bywa słupkiem). */
      groupId: group.id,
      /** Słupek, o który pytano wprost (deep-link z trasy linii); `null` = cały zespół. */
      requestedMember: group.requestedMemberId,
      name: group.name,
      modes: group.modes,
      lines: group.lines,
      wheelchairNote: group.wheelchairNote,
      members: group.members,
      /** Aktywny słupek, gdy zawężono jawnym `?slupek=`; inaczej `null`. */
      activeSlupek: scopeId,
      summary,
      alerts,
      departures,
    }
  })

  return NextResponse.json({
    city,
    schedule: scheduleBlock,
    stops,
    attribution: schedule.attribution,
  })
}
