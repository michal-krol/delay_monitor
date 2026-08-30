import type { RawRoute, RawTrainOperation } from '../pkp/types'
import { resolveDelayMinutes } from './realization'

/**
 * Statystyki i kontekst jednej stacji na dziś — kafelki KPI i prawa kolumna
 * widoku stacji.
 *
 * **Zero dodatkowych zapytań do PKP** (AGENTS.md #3). Wszystko liczy się z
 * dwóch rzeczy, które cykl pollera i tak trzyma w ręku: odpowiedzi
 * `/operations` (cały dzień realizacji dla obserwowanych stacji) oraz
 * dopasowanych tras z `/schedules` (cache 24 h, `fullRoute=true`, okno
 * dziś+jutro). Ten moduł nie zna HTTP i niczego nie pobiera — czyste funkcje,
 * jak reszta `lib/board/` (AGENTS.md #6).
 *
 * Opóźnienia liczy wyłącznie przez `resolveDelayMinutes()` z `realization.ts`.
 * Nie ma tu drugiej odpowiedzi na pytanie „czy to się wydarzyło i o ile jest
 * spóźnione" — to niezmiennik #2 i już raz kosztował rozjazd między tablicą
 * a panelem szczegółów.
 */

/**
 * Domyślny próg punktualności w minutach. Przejazd z opóźnieniem **do tego
 * progu włącznie** liczy się jako punktualny.
 *
 * Parametr, nie stała zaszyta w UI (makieta §25) — 5 minut to próg zwyczajowy
 * w statystykach kolejowych, ale to decyzja produktowa i musi dać się zmienić
 * w jednym miejscu.
 */
export const DEFAULT_PUNCTUALITY_THRESHOLD_MINUTES = 5

export type StationStats = {
  /**
   * Liczba planowych odjazdów/przyjazdów z tej stacji **dzisiaj**, wg rozkładu.
   *
   * `null` znaczy „nie wiadomo" (pobranie rozkładu padło albo nie ma jeszcze
   * tras), NIGDY „zero" — kafelek pokazuje wtedy „brak danych", nie „0
   * pociągów". Awaria nie może wyglądać jak pusty rozkład (AGENTS.md #7).
   */
  departuresToday: number | null
  arrivalsToday: number | null
  /**
   * Średnie opóźnienie w minutach z przejazdów przez tę stację, które **dziś
   * już się potwierdziły**. Nie jest to statystyka przewoźnika ani prognoza —
   * to średnia z próbki, którą widzimy, i UI musi tak ją opisać (makieta §4).
   * `null` przy pustej próbce.
   */
  averageDelayMinutes: number | null
  /** Ile zdarzeń złożyło się na `averageDelayMinutes` — bez tego liczba jest nieinterpretowalna. */
  averageDelaySample: number
  /** Odsetek (0–100) potwierdzonych dziś zdarzeń z opóźnieniem ≤ progu. `null` przy pustej próbce. */
  punctualityPct: number | null
  punctualitySample: number
  /** Próg użyty do policzenia `punctualityPct` — UI go pokazuje, zamiast kazać zgadywać. */
  punctualityThresholdMinutes: number
}

export type StationDestination = {
  stationId: string
  name: string
  count: number
}

export type StationInsights = {
  /** Najczęstsze stacje końcowe dzisiejszych odjazdów, malejąco. */
  topDestinations: StationDestination[]
  /**
   * Liczba planowych odjazdów w każdej godzinie doby (24 sloty, indeks =
   * godzina warszawska). Same zera to poprawna odpowiedź „rozkład pusty";
   * brak rozkładu sygnalizuje `null` na całości.
   */
  hourlyTraffic: number[] | null
}

const MAX_TOP_DESTINATIONS = 5
const HOURS_IN_DAY = 24

/**
 * Czy ta trasa kursuje danego dnia.
 *
 * `Array.isArray` nie jest paranoją: `/schedules` jest wołane oknem
 * dziś+jutro, a statystyki liczą wyłącznie „dzisiaj", więc bez dat kursowania
 * nie da się ich rozdzielić. Gdyby to pole zniknęło z odpowiedzi API, samo
 * `.includes()` rzuciłoby TypeError w środku cyklu pollera i wywaliło snapshot
 * KAŻDEJ obserwowanej stacji -- cała tablica zniknęłaby przez statystykę,
 * która jest wyłącznie dodatkiem. Brak dat = „nie wiadomo, czy dziś" = nie
 * liczymy; kafelek pokaże wtedy „brak danych", nie fałszywe zero.
 */
function runsOn(route: RawRoute, isoDate: string): boolean {
  return Array.isArray(route.operatingDates) && route.operatingDates.includes(isoDate)
}

/**
 * Godzina warszawska planowego odjazdu z `departureTime` ("HH:mm:ss", czas
 * lokalny warszawski wprost z `/schedules`). Czytana z ciągu, nie przez
 * `new Date()` — to już czas warszawski, a konwersja przez `Date` przesuwałaby
 * go o strefę procesu (AGENTS.md #1).
 */
function warsawHourOf(time: string | null): number | null {
  if (time === null) return null
  const hour = Number(time.slice(0, 2))
  return Number.isInteger(hour) && hour >= 0 && hour < HOURS_IN_DAY ? hour : null
}

/**
 * Jedno przejście po dzisiejszych trasach przez tę stację — liczniki odjazdów
 * i przyjazdów, najpopularniejsze kierunki i rozkład ruchu w dobie naraz.
 * Trzy osobne przejścia po tej samej mapie byłyby czystą stratą.
 *
 * `routes` to **surowa lista** tras z cyklu pollera, nie indeks
 * `routesByTrainId`. To rozróżnienie jest istotne: indeks trzyma po jednej
 * trasie na (przejazd, dzień), więc liczenie po nim gubiło warianty tego
 * samego przejazdu — 910 zamiast 1094 dzisiejszych odjazdów, zmierzone na
 * żywo (Warszawa Zachodnia, 2026-08-28). `null`/pusta lista znaczy „rozkład
 * niedostępny" i propaguje się jako `null` do wszystkich pól, które z niego
 * wynikają.
 */
export function computeStationSchedule(
  stationId: string,
  routes: readonly RawRoute[] | null,
  stationNames: Record<string, string>,
  todayIsoDate: string
): { departuresToday: number | null; arrivalsToday: number | null; insights: StationInsights } {
  if (routes === null || routes.length === 0) {
    return {
      departuresToday: null,
      arrivalsToday: null,
      insights: { topDestinations: [], hourlyTraffic: null },
    }
  }

  let departuresToday = 0
  let arrivalsToday = 0
  const destinationCounts = new Map<string, number>()
  const hourlyTraffic = new Array<number>(HOURS_IN_DAY).fill(0)

  for (const route of routes) {
    if (!runsOn(route, todayIsoDate)) continue

    const stopIndex = route.stations.findIndex((stop) => stop.stationId === stationId)
    if (stopIndex === -1) continue
    const stop = route.stations[stopIndex]

    if (stop.departureTime !== null) {
      departuresToday += 1

      const hour = warsawHourOf(stop.departureTime)
      if (hour !== null) hourlyTraffic[hour] += 1

      // Kierunek liczy się tylko dla odjazdów i tylko wtedy, gdy stacja
      // końcowa jest naprawdę DALEJ na trasie -- pociąg kończący bieg tutaj
      // nie jest „połączeniem do" niczego.
      const terminus = route.stations[route.stations.length - 1]
      if (terminus !== undefined && stopIndex < route.stations.length - 1) {
        destinationCounts.set(terminus.stationId, (destinationCounts.get(terminus.stationId) ?? 0) + 1)
      }
    }

    if (stop.arrivalTime !== null) arrivalsToday += 1
  }

  const topDestinations = [...destinationCounts.entries()]
    .map(([id, count]) => ({ stationId: id, name: stationNames[id] ?? id, count }))
    // Remis rozstrzygany nazwą, żeby kolejność była stabilna między cyklami --
    // inaczej lista „skakałaby" przy każdym odświeżeniu bez zmiany danych.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl'))
    .slice(0, MAX_TOP_DESTINATIONS)

  return { departuresToday, arrivalsToday, insights: { topDestinations, hourlyTraffic } }
}

/**
 * Średnie opóźnienie i punktualność z **dzisiejszej** realizacji na tej stacji.
 *
 * `todayIsoDate` nie jest ozdobnikiem: `/operations` **nie zwraca samego
 * dzisiaj**, mimo że nie przyjmuje parametru daty. Zmierzone na żywo
 * (Warszawa Zachodnia, 2026-08-28, 20:38): jedna odpowiedź niosła pociągi
 * z PIĘCIU dni kursowania (24-28.08), z czego 3799 potwierdzonych zdarzeń
 * pochodziło z dni 24-27, a z samego 28.08 — zero. Bez filtra po
 * `operatingDate` kafelek „Średnie opóźnienie ... z potwierdzonych DZIŚ
 * przejazdów" pokazywałby średnią z zeszłego tygodnia opisaną jako dzisiejszą.
 * To dokładnie ten rodzaj kłamstwa, przed którym stoi AGENTS.md #7 — i to
 * gorszy niż brak danych, bo wygląda wiarygodnie.
 *
 * Liczy **wyłącznie** przystanki potwierdzone i nieodwołane — niepotwierdzony
 * przystanek nie jest faktem, choćby PKP wpisało w nim kopię planu (AGENTS.md
 * #2). Przyjazd i odjazd na tej samej stacji to dwa osobne zdarzenia i wchodzą
 * do próbki osobno: opóźniony przyjazd, który nadrobił postojem, jest realną
 * informacją i nie powinien zniknąć w uśrednieniu z odjazdem.
 */
export function computeStationRealization(
  stationId: string,
  trains: RawTrainOperation[],
  todayIsoDate: string,
  punctualityThresholdMinutes: number = DEFAULT_PUNCTUALITY_THRESHOLD_MINUTES
): Pick<
  StationStats,
  'averageDelayMinutes' | 'averageDelaySample' | 'punctualityPct' | 'punctualitySample' | 'punctualityThresholdMinutes'
> {
  let delaySum = 0
  let sample = 0
  let punctual = 0

  for (const train of trains) {
    // Patrz nagłówek: jedna odpowiedź /operations miesza kilka dni kursowania.
    if (train.operatingDate !== todayIsoDate) continue

    const stop = train.stations.find((candidate) => candidate.stationId === stationId)
    if (stop === undefined || stop.isCancelled || !stop.isConfirmed) continue

    for (const [apiDelay, plannedAt, actualAt] of [
      [stop.arrivalDelayMinutes, stop.plannedArrival, stop.actualArrival],
      [stop.departureDelayMinutes, stop.plannedDeparture, stop.actualDeparture],
    ] as const) {
      if (plannedAt === null) continue
      const delay = resolveDelayMinutes(apiDelay, stop.isConfirmed, plannedAt, actualAt)
      if (delay === null) continue

      // Przejazd wcześniejszy niż plan nie jest „minus dwie minuty opóźnienia"
      // -- ujemna wartość zaniżałaby średnią cudzym kosztem. Dla średniej
      // liczy się jako zero, dla punktualności jako punktualny.
      delaySum += Math.max(0, delay)
      sample += 1
      if (delay <= punctualityThresholdMinutes) punctual += 1
    }
  }

  return {
    averageDelayMinutes: sample === 0 ? null : Math.round((delaySum / sample) * 10) / 10,
    averageDelaySample: sample,
    punctualityPct: sample === 0 ? null : Math.round((punctual / sample) * 100),
    punctualitySample: sample,
    punctualityThresholdMinutes,
  }
}

/** Złożenie obu przejść w jeden wynik — to, co poller dokłada do snapshotu. */
export function computeStationStats(
  stationId: string,
  trains: RawTrainOperation[],
  routes: readonly RawRoute[] | null,
  stationNames: Record<string, string>,
  todayIsoDate: string,
  punctualityThresholdMinutes: number = DEFAULT_PUNCTUALITY_THRESHOLD_MINUTES
): { stats: StationStats; insights: StationInsights } {
  const schedule = computeStationSchedule(stationId, routes, stationNames, todayIsoDate)
  const realization = computeStationRealization(stationId, trains, todayIsoDate, punctualityThresholdMinutes)

  return {
    stats: {
      departuresToday: schedule.departuresToday,
      arrivalsToday: schedule.arrivalsToday,
      ...realization,
    },
    insights: schedule.insights,
  }
}
