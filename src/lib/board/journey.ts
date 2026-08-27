import { resolveStopStatus, type RealizationStatus } from './realization'
import type { TrainDetailStop } from './trainDetail'

/**
 * Podsumowanie przejazdu dla ZAKRESU przystanków — wszystko, czego potrzebuje
 * nagłówek panelu szczegółów i wykres prognozy, policzone raz, w jednym
 * miejscu.
 *
 * Zakres (`fromIndex`/`toIndex`) jest parametrem od początku, choć dziś
 * wszyscy wywołujący biorą całą trasę. To celowe: użytkownik często jedzie
 * tylko częścią trasy pociągu, a gdy dojdzie interfejs wyboru odcinka, ma to
 * być podanie innych indeksów — nie przebudowa nagłówka i wykresu.
 *
 * Czysta funkcja, bez sieci — testowana wprost, wzorem `transformOperations`.
 */

export type JourneyPoint = {
  stationName: string
  plannedAt: string | null
  /**
   * Godzina do pokazania. Ta sama kolejność co w przebiegu trasy: fakt tylko
   * dla przystanku POTWIERDZONEGO, dalej przewidywanie PKP, na końcu plan.
   * Niepotwierdzony przystanek nigdy nie pokazuje surowego `actual` —
   * AGENTS.md #2, PKP wpisuje tam czasem kopię planu albo wartość przesuniętą
   * o całą dobę.
   */
  displayAt: string | null
}

export type DelayPoint = {
  stationName: string
  /** Minuty opóźnienia; `null` = nie wiadomo (przystanek jeszcze bez faktu i bez szacunku). */
  delayMinutes: number | null
  /** `fact` — przystanek potwierdzony, liczba jest faktem. `projection` — szacunek z wcześniejszego przystanku, patrz `TrainDetailStop.estimatedDelayMinutes`. */
  kind: 'fact' | 'projection'
}

export type JourneySummary = {
  origin: JourneyPoint | null
  destination: JourneyPoint | null
  /** Planowy czas przejazdu w minutach na tym odcinku; `null` gdy brakuje któregoś planu. */
  plannedDurationMinutes: number | null
  stopCount: number
  /** Status całego odcinka = status przystanku docelowego. Wyłącznie przez `resolveStopStatus`. */
  overallStatus: RealizationStatus
  /** Faktyczne opóźnienie na celu — `null`, dopóki cel nie jest potwierdzony. */
  arrivalDelayMinutes: number | null
  /** Szacunek opóźnienia na celu (nie fakt) — do `DelayBadge`, gdy `overallStatus === 'enRoute'`. */
  estimatedArrivalDelayMinutes: number | null
  delaySeries: DelayPoint[]
  /** Punktualność dotychczas: ile potwierdzonych przystanków było na czas z ilu. `null`, gdy żaden nie jest jeszcze potwierdzony. */
  punctuality: { onTime: number; total: number } | null
}

/**
 * Opóźnienie przystanku W ŚRODKU trasy — odjazdowe pierwsze, bo to ono
 * decyduje, czy podróż stąd dalej rusza planowo. Na przystanku DOCELOWYM
 * obowiązuje odwrotna kolejność (patrz `destinationDelayMinutes`): tam liczy
 * się przyjazd, bo pasażer pyta „czy dojadę na czas".
 *
 * Wyeksportowane, żeby `ConnectionDetails.tsx` używało tej samej funkcji
 * zamiast własnej kopii — dwie niezależne implementacje tej samej reguły już
 * raz rozjechały tablicę z panelem szczegółów (AGENTS.md #2).
 */
export function stopDelayMinutes(stop: TrainDetailStop): number | null {
  return stop.departureDelayMinutes ?? stop.arrivalDelayMinutes
}

function destinationDelayMinutes(stop: TrainDetailStop): number | null {
  return stop.arrivalDelayMinutes ?? stop.departureDelayMinutes
}

function displayTime(planned: string | null, actual: string | null, predicted: string | null, isConfirmed: boolean): string | null {
  if (isConfirmed && actual !== null) return actual
  if (predicted !== null) return predicted
  return planned
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000)
}

const EMPTY: JourneySummary = {
  origin: null,
  destination: null,
  plannedDurationMinutes: null,
  stopCount: 0,
  overallStatus: 'unknown',
  arrivalDelayMinutes: null,
  estimatedArrivalDelayMinutes: null,
  delaySeries: [],
  punctuality: null,
}

export type JourneyOptions = {
  /** Pierwszy przystanek odcinka; domyślnie początek trasy. */
  fromIndex?: number
  /** Ostatni przystanek odcinka; domyślnie koniec trasy. */
  toIndex?: number
  /**
   * „Teraz" — przekazywane dalej do `resolveStopStatus`, żeby cel z planem
   * dawno w przeszłości i wciąż bez potwierdzenia dostał „brak danych"
   * zamiast pewnego siebie „jeszcze nie wyjechał" (zamrożony feed PKP,
   * patrz `STALE_UNCONFIRMED_MS` w `realization.ts`). Bez tego nagłówek
   * mógłby twierdzić coś innego niż wiersz tego samego przystanku niżej.
   */
  now?: Date
}

export function summariseJourney(stops: TrainDetailStop[], options: JourneyOptions = {}): JourneySummary {
  if (stops.length === 0) return EMPTY

  const { fromIndex = 0, toIndex = stops.length - 1, now } = options

  // Zakres pochodzi docelowo z wyboru użytkownika, czyli spoza aplikacji
  // (AGENTS.md #4) — przycinamy zamiast rzucać. Nieprawidłowy zakres ma po
  // cichu znaczyć „cała trasa", nigdy wywrócić render.
  const from = Math.min(Math.max(fromIndex, 0), stops.length - 1)
  const to = Math.min(Math.max(toIndex, from), stops.length - 1)
  const leg = stops.slice(from, to + 1)

  const originStop = stops[from]
  const destinationStop = stops[to]

  const origin: JourneyPoint = {
    stationName: originStop.stationName,
    plannedAt: originStop.plannedDeparture,
    displayAt: displayTime(originStop.plannedDeparture, originStop.actualDeparture, originStop.predictedDeparture, originStop.isConfirmed),
  }
  const destination: JourneyPoint = {
    stationName: destinationStop.stationName,
    plannedAt: destinationStop.plannedArrival,
    displayAt: displayTime(destinationStop.plannedArrival, destinationStop.actualArrival, destinationStop.predictedArrival, destinationStop.isConfirmed),
  }

  const delaySeries: DelayPoint[] = leg.map((stop) =>
    stop.isConfirmed
      ? { stationName: stop.stationName, delayMinutes: stopDelayMinutes(stop), kind: 'fact' }
      : { stationName: stop.stationName, delayMinutes: stop.estimatedDelayMinutes, kind: 'projection' }
  )

  const facts = delaySeries.filter((point) => point.kind === 'fact' && point.delayMinutes !== null)

  return {
    origin,
    destination,
    // Fallback na drugi czas krańcowy: przystanek początkowy trasy nie ma
    // przyjazdu, końcowy nie ma odjazdu, a odcinek może zaczynać się lub
    // kończyć na dowolnym z nich.
    plannedDurationMinutes: minutesBetween(
      originStop.plannedDeparture ?? originStop.plannedArrival,
      destinationStop.plannedArrival ?? destinationStop.plannedDeparture
    ),
    stopCount: leg.length,
    overallStatus: resolveStopStatus({
      isCancelled: destinationStop.isCancelled,
      isConfirmed: destinationStop.isConfirmed,
      delayMinutes: destinationDelayMinutes(destinationStop),
      hasTrainStarted: destinationStop.hasTrainStarted,
      // Na celu liczy się przyjazd — odwrotnie niż w środku trasy, gdzie
      // pierwszeństwo ma odjazd.
      plannedAt: destinationStop.plannedArrival ?? destinationStop.plannedDeparture,
      now,
    }),
    arrivalDelayMinutes: destinationDelayMinutes(destinationStop),
    estimatedArrivalDelayMinutes: destinationStop.estimatedDelayMinutes,
    delaySeries,
    punctuality: facts.length === 0 ? null : { onTime: facts.filter((point) => point.delayMinutes! < 1).length, total: facts.length },
  }
}
