import type { RawOperationStation, RawRoute, RawTrainOperation } from '../pkp/types'
import { findRouteForTrain } from './routeKey'

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
 *
 * 10 → 6 (2026-09): każda stacja pomocnicza powiększa zbiorcze `/operations`
 * (4-5 dni kursowania naraz, wielostronowe -- patrz `fetchAllOperations`
 * w `poller.ts`). 6 wystarcza na najbliższe „w trasie" połączenia; przy
 * `UPSTREAM_LOOKBACK_HOPS = 7` to do ~6×7×2 stacji na węzeł, wciąż pod
 * `MAX_AUX_STATIONS` (150) po zsumowaniu wszystkich obserwowanych.
 */
export const UPSTREAM_CANDIDATE_LIMIT = 6

/**
 * Ile przystanków wstecz sprawdzamy szukając potwierdzonego, nie tylko
 * bezpośrednio poprzedni. Na gęstych liniach (SKM/KM co 2-3 min) potwierdzenie
 * z PKP spóźnia się o KILKA kolejnych przystanków naraz. Wiarygodnym sygnałem
 * „pociąg jedzie" dla wiersza tablicy jest wtedy TYLKO potwierdzony przystanek
 * wstecz -- bo bulk `/operations?stations=X` zwraca `trainStatus` względem
 * stopu X (`S`, dopóki pociąg nie dojedzie do X), mimo że globalnie jest `P`
 * (zweryfikowane na żywo 2026-09-03: Warszawa Ursus, R1 19992 -- bulk `S`,
 * `/operations/train/...` `P` z 5 potwierdzonymi; ostatni potwierdzony przystanek
 * 5 hopów przed Ursus).
 *
 * 5 → 3 (2026-09-01, żeby `/operations` przestało się ucinać) → 7 (2026-09-03):
 * odkąd `fetchAllOperations` paginuje ucięte `/operations`, głębszy lookback nie
 * grozi już cichą utratą danych, tylko kosztuje dodatkowe strony -- a `MAX_AUX_STATIONS`
 * (150) i tak wciąż jest twardym sufitem łącznej liczby stacji pomocniczych.
 */
export const UPSTREAM_LOOKBACK_HOPS = 7

/**
 * Twardy sufit łącznej liczby stacji pomocniczych na cykl, niezależny od
 * tego, ile stacji jest akurat obserwowanych naraz — zabezpieczenie przed
 * patologicznym wzrostem, nie normalny tryb pracy.
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
  const stationIdSet = alreadyObserved
  const result = new Set<string>()

  // Jeden przebieg po `trains` zamiast osobnego pełnego skanu na każdą
  // obserwowaną stację (`stationIds.length` × `trains.length` wcześniej) --
  // ta sama odpowiedź, bo `nearest()` niżej i tak sortuje kandydatów w całości
  // przed ucięciem do limitu, więc kolejność zbierania (po pociągu, nie po
  // stacji) nic nie zmienia w wyniku.
  const departureCandidatesByStation = new Map<string, Candidate[]>()
  const arrivalCandidatesByStation = new Map<string, Candidate[]>()

  for (const train of trains) {
    const route = findRouteForTrain(routesByTrainId, train)

    for (const stop of train.stations) {
      if (!stationIdSet.has(stop.stationId) || !isEnRouteCandidate(stop)) continue

      const upstreamStationIds = findPrecedingStationIds(route, stop.stationId, UPSTREAM_LOOKBACK_HOPS).filter(
        (id) => !alreadyObserved.has(id)
      )
      if (upstreamStationIds.length === 0) continue

      if (stop.plannedDeparture !== null) {
        const list = departureCandidatesByStation.get(stop.stationId) ?? []
        list.push({ upstreamStationIds, plannedAt: stop.plannedDeparture })
        departureCandidatesByStation.set(stop.stationId, list)
      }
      if (stop.plannedArrival !== null) {
        const list = arrivalCandidatesByStation.get(stop.stationId) ?? []
        list.push({ upstreamStationIds, plannedAt: stop.plannedArrival })
        arrivalCandidatesByStation.set(stop.stationId, list)
      }
    }
  }

  for (const stationId of stationIds) {
    for (const candidate of nearest(departureCandidatesByStation.get(stationId) ?? [], UPSTREAM_CANDIDATE_LIMIT)) {
      for (const id of candidate.upstreamStationIds) result.add(id)
    }
    for (const candidate of nearest(arrivalCandidatesByStation.get(stationId) ?? [], UPSTREAM_CANDIDATE_LIMIT)) {
      for (const id of candidate.upstreamStationIds) result.add(id)
    }

    if (result.size >= MAX_AUX_STATIONS) break
  }

  return result.size <= MAX_AUX_STATIONS ? result : new Set([...result].slice(0, MAX_AUX_STATIONS))
}
