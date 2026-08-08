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
   * Czy pociąg już ruszył w trasę, mimo że ten konkretny przystanek jeszcze
   * nie jest potwierdzony. Domyślnie `false`. Dwa niezależne źródła tego
   * sygnału, w zależności od tego, co widzi wywołujący:
   * `board/trainDetail.ts` zna pełną trasę pociągu i przekazuje `true`, gdy
   * jakikolwiek wcześniejszy przystanek jest potwierdzony; `board/transform.ts`
   * nie ma tej widoczności (patrz `client.ts`, `fullRoutes`), więc korzysta
   * z `hasTrainStartedFromStatus()` niżej — całopociągowego `trainStatus`,
   * który i tak przychodzi za darmo w każdej odpowiedzi `/operations`.
   */
  hasTrainStarted?: boolean
}): RealizationStatus {
  if (params.isCancelled) return 'cancelled'
  if (!params.isConfirmed) return params.hasTrainStarted ? 'enRoute' : 'notStarted'
  if (params.delayMinutes === null) return 'unknown'
  return params.delayMinutes >= 1 ? 'delayed' : 'onTime'
}

/**
 * Czy pociąg jako całość już wyjechał z pierwszego przystanku swojej trasy —
 * wyłącznie do pytania „czy w ogóle ruszył", NIE do pytania „czy TEN
 * przystanek się wydarzył" (do tego służy `isConfirmed`, per przystanek —
 * patrz nagłówek pliku i `resolveStopStatus`). To rozróżnienie ma znaczenie:
 * `trainStatus` bywa nieaktualny albo mylący na poziomie pojedynczego
 * przystanku (stąd ten sam `trainStatus: 'S'` obserwowany razem z
 * `actualDeparture` będącym kopią planu — patrz nagłówek pliku), ale na
 * poziomie całego pociągu `P`/`C` wiarygodnie znaczy „coś na tej trasie już
 * się potwierdziło, gdzieś".
 *
 * Świadomie BEZ `Q` (PartialCancelled): częściowe odwołanie może być znane
 * z góry, zanim pociąg w ogóle wyjechał z pierwszego przystanku — w
 * przeciwieństwie do `P`, samo `Q` nie dowodzi, że cokolwiek już się
 * wydarzyło (patrz `transform.test.ts`, przypadek Q + niepotwierdzony
 * przystanek).
 */
export function hasTrainStartedFromStatus(trainStatus: string | null): boolean {
  return trainStatus === 'P' || trainStatus === 'C'
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
