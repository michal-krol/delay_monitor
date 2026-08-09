import type { RawOperationStation, RawRoute, RawTrainOperation } from '../pkp/types'
import { routeKey } from './routeKey'

/**
 * Ile najbliższych "w trasie" połączeń per stacja per kierunek dostaje
 * estymatę opóźnienia — dobrane pod NAJSZERSZY widok, w którym się to
 * pokazuje: pełną tablicę stacji (`FullBoard.tsx`), pokazującą do
 * `MAX_ROWS` (`transform.ts`) połączeń w przód. Kafelek dashboardu
 * (`StationCard.tsx`, `.slice(0, 3)`) i tak pokazuje tylko podzbiór tych
 * samych, najbliższych połączeń, więc nic na tym nie traci przy węższym
 * limicie — ale odwrotnie (limit dobrany pod kafelek) zostawiał większość
 * połączeń widocznych na pełnej tablicy bez żadnej szansy na estymatę,
 * niezależnie od tego, jak długo by się czekało (zaobserwowane na żywo:
 * Warszawa Zachodnia, 5 połączeń "w trasie" widocznych, tylko 3 miały w
 * ogóle szansę na liczbę). Ograniczone świadomie: to jest liczba
 * dodatkowych stacji "pomocniczych" dokładanych do TEGO SAMEGO zapytania
 * `/operations`, więc rozmiar odpowiedzi rośnie liniowo z tą liczbą, nie
 * eksploduje jak `fullRoutes=true` (patrz `client.ts`).
 */
export const UPSTREAM_CANDIDATE_LIMIT = 10

/**
 * Ile przystanków wstecz sprawdzamy szukając potwierdzonego, nie tylko
 * bezpośrednio poprzedni. Na gęstych liniach (SKM co 3-4 min) potwierdzenie
 * z PKP potrafi spóźnić się o kilka minut naraz -- czyli o KILKA kolejnych
 * przystanków, nie jeden (zaobserwowane na żywo: S3 10556, przystanek
 * bezpośrednio przed obserwowaną stacją jeszcze niepotwierdzony, trzy wstecz
 * już tak). Wciąż tylko więcej ID w TYM SAMYM zapytaniu `/operations`, nie
 * `fullRoutes=true` ani zapytanie per pociąg jak w `trainDetail.ts`.
 */
export const UPSTREAM_LOOKBACK_HOPS = 5

/**
 * Twardy sufit łącznej liczby stacji pomocniczych na cykl, niezależny od
 * tego, ile stacji jest akurat obserwowanych naraz — zabezpieczenie przed
 * patologicznym wzrostem, nie normalny tryb pracy. Podniesiony razem z
 * `UPSTREAM_LOOKBACK_HOPS` (do 5 przystanków wstecz na kandydata zamiast 1).
 */
export const MAX_AUX_STATIONS = 150

/**
 * Do `limit` stacji PRZED `stationId` na trasie `route`, od najbliższej —
 * źródło danych do estymaty "prawdopodobnie tyle samo opóźnienia, co na
 * niedawnym przystanku". Pusta lista, gdy nie ma dopasowanej trasy,
 * `stationId` jest pierwszym przystankiem (nie ma niczego wcześniej) albo
 * w ogóle nie występuje na tej trasie.
 *
 * Stacja występująca na trasie dwa razy (pętla) rozwiązuje się względem
 * PIERWSZEGO wystąpienia — ta sama, już istniejąca granica co
 * `findRouteStop()` w `transform.ts` (peron/tor mają dokładnie to samo
 * ograniczenie); nieodkrywana tu na nowo, tylko odziedziczona.
 */
export function findPrecedingStationIds(route: RawRoute | undefined, stationId: string, limit: number): string[] {
  if (!route) return []
  const idx = route.stations.findIndex((stop) => stop.stationId === stationId)
  if (idx <= 0) return []
  const start = Math.max(0, idx - limit)
  return route.stations
    .slice(start, idx)
    .map((stop) => stop.stationId)
    .reverse()
}

/**
 * Czy ten przystanek jest kandydatem do estymaty. Świadomie BEZ
 * `hasTrainStartedFromStatus(trainStatus)` -- to pole bywa `S` (nie
 * wyjechał) nawet dla pociągu jadącego od godzin (np. inny scheduleId/orderId
 * per odcinek trasy), więc użycie go jako bramki tutaj kasowałoby szansę na
 * odkrycie, że poprzedni przystanek jest już potwierdzony. `isConfirmed` per
 * przystanek jest jedynym w pełni zaufanym sygnałem (AGENTS.md #2) -- więc
 * pytamy o stację poprzednią zawsze, gdy jest co najmniej jedna wcześniejsza
 * na trasie (patrz `findPrecedingStationId` w wywołującym), a `trainStatus`
 * zostaje tylko jako tańszy, dodatkowy sygnał w `transform.ts`.
 */
function isEnRouteCandidate(stop: RawOperationStation): boolean {
  return !stop.isCancelled && !stop.isConfirmed
}

type Candidate = { upstreamStationIds: string[]; plannedAt: string }

function nearest(candidates: Candidate[], limit: number): Candidate[] {
  return [...candidates]
    .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime())
    .slice(0, limit)
}

/**
 * Dla każdej obserwowanej stacji: najbliższe (max `UPSTREAM_CANDIDATE_LIMIT`
 * per kierunek) połączenia "w trasie" bez potwierdzonego przystanku tutaj —
 * i do `UPSTREAM_LOOKBACK_HOPS` stacji przed nimi na trasie, żeby dołączyć
 * je do NASTĘPNEGO zapytania `/operations` (ten sam cykl nie wystarczy:
 * dopiero poznajemy, o co pytać). Stacje już i tak obserwowane (`stationIds`)
 * są pomijane -- ich dane i tak przyjdą, nie trzeba ich dokładać jako "pomocnicze".
 *
 * Czysta funkcja nad tym, co `runTick()` w `poller.ts` już ma z bieżącego
 * cyklu (`result.trains`, `routesByTrainId`) -- zero dodatkowego zapytania do
 * PKP, żeby to policzyć.
 */
export function collectUpstreamCandidates(
  stationIds: string[],
  trains: RawTrainOperation[],
  routesByTrainId: Map<string, RawRoute>
): Set<string> {
  const alreadyObserved = new Set(stationIds)
  const result = new Set<string>()

  for (const stationId of stationIds) {
    const departureCandidates: Candidate[] = []
    const arrivalCandidates: Candidate[] = []

    for (const train of trains) {
      const stop = train.stations.find((s) => s.stationId === stationId)
      if (!stop || !isEnRouteCandidate(stop)) continue

      const route = routesByTrainId.get(routeKey(train.scheduleId, train.orderId, train.trainOrderId))
      const upstreamStationIds = findPrecedingStationIds(route, stationId, UPSTREAM_LOOKBACK_HOPS).filter(
        (id) => !alreadyObserved.has(id)
      )
      if (upstreamStationIds.length === 0) continue

      if (stop.plannedDeparture !== null) departureCandidates.push({ upstreamStationIds, plannedAt: stop.plannedDeparture })
      if (stop.plannedArrival !== null) arrivalCandidates.push({ upstreamStationIds, plannedAt: stop.plannedArrival })
    }

    for (const candidate of nearest(departureCandidates, UPSTREAM_CANDIDATE_LIMIT)) {
      for (const id of candidate.upstreamStationIds) result.add(id)
    }
    for (const candidate of nearest(arrivalCandidates, UPSTREAM_CANDIDATE_LIMIT)) {
      for (const id of candidate.upstreamStationIds) result.add(id)
    }

    if (result.size >= MAX_AUX_STATIONS) break
  }

  return result.size <= MAX_AUX_STATIONS ? result : new Set([...result].slice(0, MAX_AUX_STATIONS))
}
