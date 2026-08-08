/**
 * Jedno miejsce na pytanie „czy ten przystanek już się wydarzył, i o ile
 * jest opóźniony" — używane zarówno przez tablicę (`board/transform.ts`) jak
 * i panel szczegółów połączenia (`board/trainDetail.ts`, `ConnectionDetails.tsx`).
 *
 * Wcześniej każde z tych miejsc miało własną, nieco inną odpowiedź na to samo
 * pytanie i już raz się rozjechały: tablica sprawdzała `trainStatus === 'S'`
 * i obecność „faktycznego czasu", panel szczegółów od razu poprawnie
 * sprawdzał `isConfirmed`. PKP potrafi wpisać w pole „faktyczny czas" kopię
 * czasu planowego dla pociągu, który jeszcze nie wyjechał (zaobserwowane na
 * żywo: R1 91342, Koleje Mazowieckie, `trainStatus: "S"`, `actualDeparture`
 * identyczne z `plannedDeparture` godziny przed odjazdem) — więc sama
 * obecność „faktycznego czasu" nigdy nie może być dowodem realizacji.
 * `isConfirmed` ("Czy przejazd potwierdzony" — opis pola w swaggerze PKP)
 * jest jedynym wiarygodnym sygnałem i działa dla każdego `trainStatus`
 * (`S`, `Q`, `P`, ...), nie tylko dla całopociągowego `S`.
 */
export type RealizationStatus = 'onTime' | 'delayed' | 'cancelled' | 'unknown' | 'notStarted' | 'enRoute'

export function resolveStopStatus(params: {
  isCancelled: boolean
  isConfirmed: boolean
  delayMinutes: number | null
  /**
   * Czy pociąg minął już (potwierdzony) jakiś wcześniejszy przystanek na
   * trasie, mimo że ten konkretny jeszcze nie jest potwierdzony. Domyślnie
   * `false` — `board/transform.ts` nie ma widoczności na przystanki spoza
   * zapytanej stacji (patrz `client.ts`, `fullRoutes`), więc dla tablicy ten
   * przypadek zawsze wychodzi jako `notStarted`, tak jak dziś. Tylko
   * `board/trainDetail.ts`, który zna pełną trasę pociągu, przekazuje `true`.
   */
  hasTrainStarted?: boolean
}): RealizationStatus {
  if (params.isCancelled) return 'cancelled'
  if (!params.isConfirmed) return params.hasTrainStarted ? 'enRoute' : 'notStarted'
  if (params.delayMinutes === null) return 'unknown'
  return params.delayMinutes >= 1 ? 'delayed' : 'onTime'
}

/**
 * `null`, gdy `isConfirmed` jest `false` — opóźnienie liczone z
 * niepotwierdzonych (potencjalnie powielonych z planu) danych nigdy nie
 * powstaje, więc nie ma się czym pomylić dalej w łańcuchu wywołań.
 */
export function resolveDelayMinutes(
  apiDelay: number | null,
  isConfirmed: boolean,
  plannedAt: string | null,
  actualAt: string | null
): number | null {
  if (!isConfirmed) return null
  if (apiDelay !== null) return apiDelay
  if (plannedAt === null || actualAt === null) return null
  return Math.round((new Date(actualAt).getTime() - new Date(plannedAt).getTime()) / 60000)
}
