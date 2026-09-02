import type { RawDisruption, RawRoute, RawTrainOperation } from '../pkp/types'
import { resolvePlannedTime } from '../pkp/time'
import { findRouteStop, routeStopPlatform } from './transform'
import { hasTrainStartedFromStatus, resolveDelayMinutes, resolvePredictedTime, resolveStopStatus } from './realization'
import { findStopDisruptionMessages } from './disruptions'

export type TrainDetailStop = {
  stationId: string
  stationName: string
  plannedArrival: string | null
  actualArrival: string | null
  arrivalDelayMinutes: number | null
  plannedDeparture: string | null
  actualDeparture: string | null
  departureDelayMinutes: number | null
  isCancelled: boolean
  isConfirmed: boolean
  /** Peron PLANOWY — patrz `routeStopPlatform()`. `null` = nie podano. */
  platform: string | null
  /** Tor PLANOWY, niezależny od `platform` — jedno bywa znane bez drugiego (makieta §10). */
  track: string | null
  /**
   * Czy pociąg już ruszył w trasę, mimo że ten konkretny przystanek jeszcze
   * nie jest `isConfirmed`. Dwa źródła, tak samo jak na tablicy
   * (`transform.ts`): (1) całopociągowy `trainStatus` ∈ {P, C} — błogosławiony
   * wyjątek z AGENTS.md #2, bo PKP potrafi godzinami nie potwierdzać
   * pojedynczych przystanków pociągu, który jednak jedzie; (2) jakikolwiek
   * wcześniejszy przystanek tej trasy (wcześniejszy w `operation.stations`)
   * miał już `isConfirmed: true`. Pozwala `resolveStopStatus` odróżnić "w
   * trasie" od "jeszcze nie wyjechał w ogóle" (patrz `realization.ts`).
   */
  hasTrainStarted: boolean
  /**
   * Szacunek, nie fakt — opóźnienie z najbliższego wcześniejszego
   * potwierdzonego, nieodwołanego przystanku TEJ SAMEJ trasy, czytany tylko
   * gdy ten przystanek jest jeszcze `enRoute` (patrz `resolveStopStatus`).
   * Ten sam pomysł co `estimatedDelayMinutes` w `board/transform.ts`, tylko
   * prościej: tu mamy już pełną, uporządkowaną listę przystanków TEGO
   * pociągu, więc "najbliższy wcześniejszy potwierdzony" to po prostu
   * ostatni napotkany podczas przejścia listy, bez szukania trasy/stacji
   * pomocniczych. Nigdy nie zastępuje ani nie wpływa na `arrivalDelayMinutes`/
   * `departureDelayMinutes`.
   */
  estimatedDelayMinutes: number | null
  /**
   * Przewidywana godzina PKP dla jeszcze niepotwierdzonego przystanku —
   * inne źródło niż `estimatedDelayMinutes` powyżej: to nie nasza estymata
   * z wcześniejszego przystanku, tylko `actualArrival`/`actualDeparture`
   * odczytane wprost z PKP dla TEGO przystanku, gdy jest wiarygodne (patrz
   * `resolvePredictedTime` niżej). Zweryfikowane na żywych danych: PKP
   * czasem wpisuje tu realną, samodzielnie przeliczoną projekcję (z
   * odpowiadającym jej `arrivalDelayMinutes`/`departureDelayMinutes`), ale
   * dla dalszych w czasie przystanków bywa też, że wpisuje wartość
   * przesuniętą o całą dobę względem planu — bez żadnego pola opóźnienia.
   * `null`, gdy przystanek jest już potwierdzony (wtedy liczy się fakt, nie
   * przewidywanie) albo gdy różnica wygląda na ten artefakt.
   */
  predictedArrival: string | null
  predictedDeparture: string | null
  /** Zdekodowane treści utrudnień obejmujących ten przystanek tego przejazdu -- [] gdy brak. Patrz `board/disruptions.ts`. */
  disruptionMessages: string[]
  /**
   * Planowy czas postoju w pełnych minutach — `null` dla przystanku krańcowego
   * (tylko przyjazd albo tylko odjazd) i dla pociągu bez dopasowanej trasy.
   * Liczony z PLANU, nie z realizacji: pasażer pyta „ile mam czasu", zanim
   * pociąg tu dojedzie. Patrz `resolveStopMinutes`.
   */
  stopMinutes: number | null
  /**
   * „tylko dla wysiadających" / „tylko dla wsiadających" — `null` dla zwykłego
   * postoju (na żywym API to zdecydowana większość, patrz `pkp/schema.ts`).
   */
  stopTypeName: string | null
}

/**
 * Postój w pełnych minutach, `null` gdy nie ma obu planowych czasów albo gdy
 * odjazd nie jest po przyjeździe.
 *
 * `Math.max(1, ...)` nie jest kosmetyką: na żywym API (475 tras, 8380
 * przystanków) 1650 z 7173 postojów trwa KRÓCEJ niż minutę. Samo
 * `Math.round(30_000 / 60_000)` dałoby dla nich `0`, czyli „brak postoju" —
 * a postój istnieje, tylko jest krótki. Zero jest tu zawsze błędną odpowiedzią.
 */
function resolveStopMinutes(plannedArrival: string | null, plannedDeparture: string | null): number | null {
  if (plannedArrival === null || plannedDeparture === null) return null
  const diffMs = new Date(plannedDeparture).getTime() - new Date(plannedArrival).getTime()
  if (diffMs <= 0) return null
  return Math.max(1, Math.round(diffMs / 60_000))
}

/**
 * Indeks przystanku, na którym pociąg fizycznie jest — ostatni POTWIERDZONY
 * przystanek trasy, `-1` gdy żaden (pociąg jeszcze nigdzie nie ruszył).
 *
 * Jedyne źródło wskaźnika „Pociąg jest tutaj" w panelu szczegółów. Świadomie
 * `isConfirmed`, nie obecność `actualArrival`/`actualDeparture`: PKP potrafi
 * wpisać w pole faktycznego czasu kopię planu godziny przed odjazdem
 * (AGENTS.md #2, `realization.ts`), więc czas faktyczny nigdy nie dowodzi, że
 * pociąg tam był. Nie duplikuj tego pytania w komponencie.
 */
export function resolveCurrentStopIndex(stops: TrainDetailStop[]): number {
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].isConfirmed) return index
  }
  return -1
}

/** Planowy czas zdarzenia na przystanku — przyjazd (bo pociąg dojeżdża, zanim odjedzie), w ostateczności odjazd (przystanek początkowy). `null` = brak dopasowanej trasy. */
function scheduledStopTime(stop: TrainDetailStop): string | null {
  return stop.plannedArrival ?? stop.plannedDeparture
}

/**
 * Czy w panelu szczegółów połączenia pokazujemy pozycję SZACOWANĄ Z ROZKŁADU
 * zamiast realnej. Wyłącznie dla `ConnectionDetails.tsx` — tablica
 * (`board/transform.ts`) tego nie używa i jej zachowanie się nie zmienia
 * (patrz AGENTS.md #2/#10 oraz plan „trains-schedule-position").
 *
 * `true` wtedy i tylko wtedy, gdy PKP nie daje ŻADNEGO sygnału realizacji, a wg
 * rozkładu pociąg właśnie jedzie:
 *  - jest lista przystanków,
 *  - żaden przystanek nie jest `isConfirmed` — jakiekolwiek potwierdzenie znaczy,
 *    że `resolveCurrentStopIndex` ma realne dane i to ono wygrywa,
 *  - żaden przystanek nie jest `isCancelled` ORAZ `trainStatus !== 'X'`
 *    (całościowe odwołanie); `Q` (częściowe) jest dopuszczone — zastrzeżenie w UI
 *    to pokrywa,
 *  - pierwszy i ostatni przystanek mają planowy czas (trasa dopasowana),
 *  - `now` mieści się w [plan odjazdu z pierwszego, plan przyjazdu do ostatniego).
 */
export function isScheduleProjection(stops: TrainDetailStop[], trainStatus: string | null, now: Date): boolean {
  if (stops.length === 0 || trainStatus === 'X') return false
  if (stops.some((stop) => stop.isConfirmed || stop.isCancelled)) return false

  const start = stops[0].plannedDeparture ?? stops[0].plannedArrival
  const end = stops[stops.length - 1].plannedArrival ?? stops[stops.length - 1].plannedDeparture
  if (start === null || end === null) return false

  const nowMs = now.getTime()
  return nowMs >= new Date(start).getTime() && nowMs < new Date(end).getTime()
}

/**
 * Indeks przystanku, przy którym pociąg wg ROZKŁADU teraz jest — najwyższy `i`,
 * dla którego planowy przyjazd (w ostateczności odjazd) już minął. `-1`, gdy
 * żaden (guard; przy `isScheduleProjection() === true` nie powinno się zdarzyć).
 * Przystanki bez planowego czasu są pomijane — traktowane jak jeszcze nieosiągnięte.
 */
export function resolveScheduledStopIndex(stops: TrainDetailStop[], now: Date): number {
  const nowMs = now.getTime()
  let index = -1
  for (let i = 0; i < stops.length; i += 1) {
    const at = scheduledStopTime(stops[i])
    if (at !== null && new Date(at).getTime() <= nowMs) index = i
  }
  return index
}

/**
 * Łączy realizację (`operation`, czasy faktyczne) z trasą rozkładową (`route`,
 * czasy planowe + peron/tor) w pełną, przystanek-po-przystanku listę do panelu
 * szczegółów połączenia. `route` bywa `null` — pociąg bez dopasowanej trasy
 * (patrz „Znane ograniczenia" w README) wciąż pokazuje realizację, tylko bez
 * planu/opóźnienia/peronu.
 *
 * Czysta funkcja — bez sieci, testowalna wprost (wzorem `transformOperations`).
 */
export function buildTrainDetailStops(
  operation: RawTrainOperation,
  route: RawRoute | null,
  stationNames: Record<string, string>,
  disruptions: RawDisruption[] = [],
  disruptionTypes: Record<string, string> = {},
  // Do `resolveStopStatus`: niepotwierdzony przystanek z planem dawno w tyle
  // to „brak danych", nie „jeszcze nie wyjechał" (patrz `realization.ts`).
  now: Date = new Date()
): TrainDetailStop[] {
  // Akumulator "czy pociąg już ruszył". Zaczyna od całopociągowego
  // `trainStatus` (P/C — patrz `hasTrainStarted` w typie wyżej i AGENTS.md #2);
  // dalej podnoszony przez pierwszy `isConfirmed` przystanek. Czytany PRZED
  // uwzględnieniem bieżącego przystanku, więc pierwszy potwierdzony przystanek
  // trasy sam dostaje wartość sprzed swojego potwierdzenia (to on jest dowodem
  // wyjazdu, nie dowodem, że coś wcześniej już się wydarzyło).
  let hasTrainStarted = hasTrainStartedFromStatus(operation.trainStatus)
  // Opóźnienie z najbliższego wcześniejszego potwierdzonego, nieodwołanego
  // przystanku -- źródło `estimatedDelayMinutes` niżej. Odjazdowe pierwsze,
  // ten sam porządek co `stopDelayMinutes()` w `ConnectionDetails.tsx`.
  let lastConfirmedDelayMinutes: number | null = null

  return operation.stations.map((stop) => {
    const routeStop = findRouteStop(route, stop.stationId)

    const plannedArrival = resolvePlannedTime(stop.plannedArrival, operation.operatingDate, routeStop?.arrivalTime, routeStop?.arrivalDay)
    const plannedDeparture = resolvePlannedTime(stop.plannedDeparture, operation.operatingDate, routeStop?.departureTime, routeStop?.departureDay)
    const arrivalDelayMinutes = resolveDelayMinutes(stop.arrivalDelayMinutes, stop.isConfirmed, plannedArrival, stop.actualArrival)
    const departureDelayMinutes = resolveDelayMinutes(stop.departureDelayMinutes, stop.isConfirmed, plannedDeparture, stop.actualDeparture)
    const predictedArrival = resolvePredictedTime(plannedArrival, stop.actualArrival, stop.isConfirmed)
    const predictedDeparture = resolvePredictedTime(plannedDeparture, stop.actualDeparture, stop.isConfirmed)
    const status = resolveStopStatus({
      isCancelled: stop.isCancelled,
      isConfirmed: stop.isConfirmed,
      delayMinutes: departureDelayMinutes ?? arrivalDelayMinutes,
      hasTrainStarted,
      plannedAt: plannedDeparture ?? plannedArrival,
      now,
    })

    const result: TrainDetailStop = {
      stationId: stop.stationId,
      stationName: stationNames[stop.stationId] ?? stop.stationId,
      plannedArrival,
      actualArrival: stop.actualArrival,
      arrivalDelayMinutes,
      plannedDeparture,
      actualDeparture: stop.actualDeparture,
      departureDelayMinutes,
      isCancelled: stop.isCancelled,
      isConfirmed: stop.isConfirmed,
      predictedArrival,
      predictedDeparture,
      // Odjazdowy peron/tor pierwszy — to ten, przy którym pasażer czeka, żeby
      // jechać dalej; brakujący dobija peron/tor przyjazdu (np. stacja końcowa).
      ...routeStopPlatform(routeStop, 'departure'),
      hasTrainStarted,
      estimatedDelayMinutes: status === 'enRoute' ? lastConfirmedDelayMinutes : null,
      stopMinutes: resolveStopMinutes(plannedArrival, plannedDeparture),
      stopTypeName: routeStop?.stopTypeName ?? null,
      disruptionMessages:
        operation.operatingDate === null
          ? []
          : findStopDisruptionMessages(disruptions, disruptionTypes, operation.scheduleId, operation.orderId, operation.operatingDate, stop.stationId),
    }

    if (stop.isConfirmed) hasTrainStarted = true
    if (!stop.isCancelled && stop.isConfirmed) lastConfirmedDelayMinutes = departureDelayMinutes ?? arrivalDelayMinutes
    return result
  })
}
