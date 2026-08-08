import type { RawOperationStation, RawRoute, RawTrainOperation } from '../pkp/types'
import { hasTrainStartedFromStatus } from './realization'
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
 * Twardy sufit łącznej liczby stacji pomocniczych na cykl, niezależny od
 * tego, ile stacji jest akurat obserwowanych naraz — zabezpieczenie przed
 * patologicznym wzrostem (dużo ulubionych stacji × dużo pociągów "w trasie"
 * jednocześnie), nie normalny tryb pracy. Podniesiony razem z
 * `UPSTREAM_CANDIDATE_LIMIT` (10 zamiast 3 na kierunek) — jedna obserwowana
 * stacja to teraz do 20 stacji pomocniczych zamiast 6, więc dwie stacje
 * naraz już zbliżałyby się do starego sufitu 40.
 */
export const MAX_AUX_STATIONS = 80

/**
 * Stacja bezpośrednio PRZED `stationId` na trasie `route` — źródło danych do
 * estymaty "prawdopodobnie tyle samo opóźnienia, co na poprzednim
 * przystanku". `null`, gdy nie ma dopasowanej trasy, `stationId` jest
 * pierwszym przystankiem (nie ma niczego wcześniej) albo w ogóle nie
 * występuje na tej trasie.
 *
 * Stacja występująca na trasie dwa razy (pętla) rozwiązuje się względem
 * PIERWSZEGO wystąpienia — ta sama, już istniejąca granica co
 * `findRouteStop()` w `transform.ts` (peron/tor mają dokładnie to samo
 * ograniczenie); nieodkrywana tu na nowo, tylko odziedziczona.
 */
export function findPrecedingStationId(route: RawRoute | undefined, stationId: string): string | null {
  if (!route) return null
  const idx = route.stations.findIndex((stop) => stop.stationId === stationId)
  if (idx <= 0) return null
  return route.stations[idx - 1].stationId
}

/** Czy ten przystanek jest kandydatem do estymaty -- dokładnie te same dwa warunki co gałąź `enRoute` w `resolveStopStatus()`. */
function isEnRouteCandidate(stop: RawOperationStation, trainStatus: string | null): boolean {
  return !stop.isCancelled && !stop.isConfirmed && hasTrainStartedFromStatus(trainStatus)
}

type Candidate = { upstreamStationId: string; plannedAt: string }

function nearest(candidates: Candidate[], limit: number): Candidate[] {
  return [...candidates]
    .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime())
    .slice(0, limit)
}

/**
 * Dla każdej obserwowanej stacji: najbliższe (max `UPSTREAM_CANDIDATE_LIMIT`
 * per kierunek) połączenia "w trasie" bez potwierdzonego przystanku tutaj —
 * i stacja bezpośrednio przed nimi na trasie, żeby dołączyć ją do
 * NASTĘPNEGO zapytania `/operations` (ten sam cykl nie wystarczy: dopiero
 * poznajemy, o co pytać). Stacje już i tak obserwowane (`stationIds`) są
 * pomijane -- ich dane i tak przyjdą, nie trzeba ich dokładać jako "pomocnicze".
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
      if (!stop || !isEnRouteCandidate(stop, train.trainStatus)) continue

      const route = routesByTrainId.get(routeKey(train.scheduleId, train.orderId, train.trainOrderId))
      const upstreamStationId = findPrecedingStationId(route, stationId)
      if (upstreamStationId === null || alreadyObserved.has(upstreamStationId)) continue

      if (stop.plannedDeparture !== null) departureCandidates.push({ upstreamStationId, plannedAt: stop.plannedDeparture })
      if (stop.plannedArrival !== null) arrivalCandidates.push({ upstreamStationId, plannedAt: stop.plannedArrival })
    }

    for (const candidate of nearest(departureCandidates, UPSTREAM_CANDIDATE_LIMIT)) result.add(candidate.upstreamStationId)
    for (const candidate of nearest(arrivalCandidates, UPSTREAM_CANDIDATE_LIMIT)) result.add(candidate.upstreamStationId)

    if (result.size >= MAX_AUX_STATIONS) break
  }

  return result.size <= MAX_AUX_STATIONS ? result : new Set([...result].slice(0, MAX_AUX_STATIONS))
}
