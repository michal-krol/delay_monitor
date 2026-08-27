import type { RawDisruption, RawRoute, RawTrainOperation } from '../pkp/types'
import { combineWarsawDateAndTime } from '../pkp/time'
import { findRouteStop, routeStopPlatform } from './transform'
import { hasTrainStartedFromStatus, resolveDelayMinutes, resolveStopStatus } from './realization'
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
  platform: string | null
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
}

const DAY_MS = 24 * 60 * 60 * 1000
// Zaobserwowane na żywym API (4 stacje, ~7300 pociągów): każdy przypadek
// niepotwierdzonego przystanku, gdzie actual różni się od planu o dokładną
// wielokrotność doby, nie miał żadnego pola opóźnienia -- odwrotnie, każdy
// przypadek z polem opóźnienia miał różnicę NIE będącą wielokrotnością doby.
// Tolerancja tylko na zaokrąglenia SEKUND w danych źródłowych (stąd 5 s, nie
// więcej) -- zweryfikowane na żywo (produkcja, pociąg SŁOWACKI 2026/134648284,
// stacja Żyrardów, 2026-08-27): różnica dokładnie 60 s bywa realnym, malejącym
// opóźnieniem (poprzedni przystanek miał +2 min), nie artefaktem -- poprzedni
// próg 60 s (`<=`) błędnie chował taki predicted czas jako rzekomy artefakt.
const DAY_MULTIPLE_TOLERANCE_MS = 5 * 1000

function isNearDayMultiple(diffMs: number): boolean {
  const remainder = ((diffMs % DAY_MS) + DAY_MS) % DAY_MS
  return remainder <= DAY_MULTIPLE_TOLERANCE_MS || remainder >= DAY_MS - DAY_MULTIPLE_TOLERANCE_MS
}

/**
 * Przewidywana godzina dla jeszcze niepotwierdzonego przystanku -- patrz
 * `TrainDetailStop.predictedArrival`. Liczona tylko z surowego `actualAt`
 * (bez sięgania po `arrivalDelayMinutes`/`departureDelayMinutes` — ten
 * konkretny endpoint, `/operations/train/...`, w ogóle ich nie niesie,
 * stwierdzone bezpośrednio na żywym API), więc jedynym dostępnym sygnałem
 * "to nie jest ten sam artefakt co doba przesunięcia" jest sama różnica
 * czasu -- zweryfikowane bezpośrednio na żywym API (`/operations?withPlanned=true`,
 * które NIESIE pole opóźnienia): w całej sprawdzonej próbce obecność pola
 * opóźnienia i "różnica nie jest wielokrotnością doby" występowały zawsze
 * razem, nigdy osobno -- stąd sama różnica czasu jest tu wystarczającym,
 * równoważnym sygnałem, mimo że ten konkretny endpoint pola opóźnienia
 * w ogóle nie niesie.
 */
function resolvePredictedTime(plannedAt: string | null, actualAt: string | null, isConfirmed: boolean): string | null {
  if (isConfirmed || plannedAt === null || actualAt === null) return null
  const diffMs = new Date(actualAt).getTime() - new Date(plannedAt).getTime()
  if (isNearDayMultiple(diffMs)) return null
  return actualAt
}

/**
 * `/operations/train/{scheduleId}/{orderId}/{operatingDate}` — jedyne źródło
 * czasu FAKTYCZNEGO per przystanek — nie niesie ani planowego czasu, ani
 * opóźnienia (stwierdzone na żywym API, nie w dokumentacji: żaden przystanek
 * w realnej odpowiedzi nie miał `plannedArrival`/`arrivalDelayMinutes`).
 * Opóźnienie trzeba więc policzyć samemu z planu w `/schedules/route/...`
 * (`arrivalTime`/`departureTime`, HH:mm:ss) + `operatingDate`.
 *
 * Wyjątek: fixture'y mocka (i teoretycznie przyszłe warianty API) MOGĄ podać
 * `plannedArrival`/`arrivalDelayMinutes` wprost na obiekcie operacji — to ma
 * pierwszeństwo, liczenie z trasy jest tylko rezerwowe.
 */
function resolvePlannedTime(
  apiPlanned: string | null,
  operatingDate: string | null,
  time: string | null | undefined,
  dayOffset: number | null | undefined
): string | null {
  if (apiPlanned !== null) return apiPlanned
  if (operatingDate === null) return null
  return combineWarsawDateAndTime(operatingDate, time ?? null, dayOffset ?? null)
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
      platform: routeStopPlatform(routeStop, 'departure'),
      hasTrainStarted,
      estimatedDelayMinutes: status === 'enRoute' ? lastConfirmedDelayMinutes : null,
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
