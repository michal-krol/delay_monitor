import type { RawRoute } from '../pkp/types'

/**
 * Klucz łączący `/operations` z `/schedules`. `orderId` bywa identyfikatorem
 * konkretnego przejazdu w `/operations`, a nie wzorca trasy z `/schedules` —
 * `trainOrderId`, gdy obecny, jest tym wspólnym kluczem po obu stronach
 * (patrz `RawRoute.trainOrderId`). Sam `scheduleId-orderId` gubił trasę dla
 * ok. połowy pociągów w danych produkcyjnych.
 *
 * Wydzielone z `transform.ts` (który wciąż go re-eksportuje, dla
 * dotychczasowych importów) do własnego, zależnościowo pustego modułu —
 * zarówno `transform.ts`, jak i `upstreamEstimate.ts` go potrzebują, a
 * gdyby został w `transform.ts`, powstałby cykl importów między nimi.
 */
export function routeKey(scheduleId: string, orderId: string, trainOrderId: string | null): string {
  return `${scheduleId}-${trainOrderId ?? orderId}`
}

/**
 * Ten sam klucz, zawężony do JEDNEGO dnia kursowania.
 *
 * `/schedules` jest wołane oknem dziś+jutro, a PKP zwraca wtedy **osobny
 * rekord trasy dla każdego dnia** — z tym samym `trainOrderId`, ale innym
 * `orderId` i, co istotne, potrafiąco innymi peronami i przystankami.
 * Zmierzone na żywo (Warszawa Zachodnia, 2026-08-28): 2008 tras dzieli się
 * na 1657 kluczy `routeKey`, czyli 351 rekordów kolidowało; w 183 z nich
 * różniły się przystanki lub perony, a w 217 zwykła mapa „ostatni wygrywa"
 * zostawiała rekord z INNEGO dnia, mimo że dzisiejszy istniał.
 *
 * Doklejenie daty rozdziela te warianty, zamiast pozwalać jednemu nadpisać
 * drugi.
 */
export function routeDayKey(scheduleId: string, orderId: string, trainOrderId: string | null, operatingDate: string): string {
  return `${routeKey(scheduleId, orderId, trainOrderId)}|${operatingDate}`
}

/** Minimum, po którym rozpoznajemy przejazd — spełniane i przez `RawTrainOperation`, i przez `RawRoute`. */
type TrainIdentity = {
  scheduleId: string
  orderId: string
  trainOrderId: string | null
  operatingDate: string | null
}

/**
 * Trasa dla konkretnego przejazdu: najpierw wariant z JEGO dnia kursowania,
 * a dopiero w rezerwie wariant bez daty.
 *
 * Rezerwa nie jest kosmetyką — indeks budowany przez `indexRoutesByTrain()`
 * trzyma obie postacie klucza, więc trasa bez `operatingDates` (albo przejazd
 * bez `operatingDate`) nadal się dopasuje, zamiast zniknąć. Jedno miejsce na
 * to pytanie dla tablicy, estymaty i statystyk — nie trzy własne `.get()`,
 * które mogłyby się rozjechać (AGENTS.md #2, ten sam duch co `realization.ts`).
 */
export function findRouteForTrain<T>(index: Map<string, T>, train: TrainIdentity): T | undefined {
  if (train.operatingDate !== null) {
    const exact = index.get(routeDayKey(train.scheduleId, train.orderId, train.trainOrderId, train.operatingDate))
    if (exact !== undefined) return exact
  }
  return index.get(routeKey(train.scheduleId, train.orderId, train.trainOrderId))
}

/**
 * Indeks tras do wyszukiwania po przejeździe, rozdzielony po dniach
 * kursowania (patrz `routeDayKey`). Każda trasa trafia pod jeden klucz na
 * każdy swój dzień kursowania, plus — jako rezerwa — pod sam klucz przejazdu.
 *
 * Rezerwa nie nadpisuje wcześniejszego wpisu (`has()` przed `set()`): przy
 * dwóch wariantach tego samego przejazdu pierwszy jest równie dobrym
 * przybliżeniem co drugi, a „ostatni wygrywa" było właśnie tym zachowaniem,
 * które zostawiało rekord z niewłaściwego dnia.
 *
 * **Nie używaj tego indeksu do liczenia** — z definicji zwija warianty tego
 * samego przejazdu. Do liczenia służy surowa lista tras.
 */
export function indexRoutesByTrain(routes: RawRoute[]): Map<string, RawRoute> {
  const index = new Map<string, RawRoute>()

  for (const route of routes) {
    const base = routeKey(route.scheduleId, route.orderId, route.trainOrderId)
    if (!index.has(base)) index.set(base, route)

    // `Array.isArray` z tego samego powodu co w `stationStats.ts`: gdyby API
    // przestało zwracać to pole, `for...of undefined` rzuciłoby wewnątrz
    // `try` w `fetchRoutesByTrainId()`, a poller po cichu zdegradowałby CAŁY
    // rozkład do pustego -- każda tablica bez przewoźnika, kategorii i peronu.
    // Trasa bez dat kursowania zostaje wtedy pod samym kluczem przejazdu.
    if (!Array.isArray(route.operatingDates)) continue

    for (const operatingDate of route.operatingDates) {
      index.set(`${base}|${operatingDate}`, route)
    }
  }

  return index
}
