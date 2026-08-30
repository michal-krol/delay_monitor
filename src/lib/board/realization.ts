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

/**
 * Po tylu minutach od planowego czasu przystanek bez żadnego sygnału
 * realizacji (`isConfirmed` false, pociąg nigdzie nie potwierdzony) przestaje
 * być „jeszcze nie wyjechał" (co brzmi jak stwierdzony fakt) i staje się
 * „brak danych". Zaobserwowane 2026-08-27: feed `/operations` PKP zamarł na
 * ~8 h — wszystkie pociągi po ~14:00 utknęły jako `trainStatus: "S"` z
 * `actualX` = kopią planu; panel szczegółów pokazywał „jeszcze nie wyjechał"
 * dla pociągu, który wg rozkładu dawno dojechał. Próg > normalnego opóźnienia
 * bez potwierdzenia (gęsta linia potrafi spóźniać samo potwierdzenie), na
 * tyle krótki, by taką awarię złapać szybko.
 */
const STALE_UNCONFIRMED_MS = 30 * 60 * 1000

function isStaleUnconfirmed(plannedAt: string | null | undefined, now: Date | undefined): boolean {
  if (!plannedAt || !now) return false
  return now.getTime() - new Date(plannedAt).getTime() > STALE_UNCONFIRMED_MS
}

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
  /**
   * Planowy czas tego zdarzenia (odjazd, w ostateczności przyjazd) i „teraz".
   * Oba opcjonalne: gdy podane, niepotwierdzony przystanek z planem dawno
   * w przeszłości dostaje `unknown` („brak danych") zamiast `notStarted`
   * (patrz `STALE_UNCONFIRMED_MS`). Tablica ich nie podaje — jej okno
   * `LOOKBACK_WINDOW_MS` (5 min) i tak nie przepuszcza tak starego wiersza.
   */
  plannedAt?: string | null
  now?: Date
}): RealizationStatus {
  if (params.isCancelled) return 'cancelled'
  if (!params.isConfirmed) {
    if (params.hasTrainStarted) return 'enRoute'
    return isStaleUnconfirmed(params.plannedAt, params.now) ? 'unknown' : 'notStarted'
  }
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
 * PROGNOZA — przewidywana godzina dla jeszcze NIEpotwierdzonego przystanku,
 * trzecia kategoria obok PLANU (`plannedAt`) i FAKTU (`actualAt`). Nigdy nie
 * zastępuje żadnej z nich: dopóki `isConfirmed` jest `false`, nie ma faktu,
 * a gdy jest `true` — nie ma po co przewidywać (zwraca `null`).
 *
 * PKP wpisuje w `actualArrival`/`actualDeparture` dwie różne rzeczy naraz:
 * czasem realną, samodzielnie przeliczoną projekcję, a czasem — dla dalszych
 * w czasie przystanków — wartość przesuniętą o całą dobę względem planu.
 * Drugie to artefakt i musi zniknąć, stąd `isNearDayMultiple`.
 *
 * Jedna implementacja dla obu wywołujących (`trainDetail.ts` i `transform.ts`)
 * — patrz nagłówek pliku i AGENTS.md #2. `/operations/train/...` w ogóle nie
 * niesie pól opóźnienia (stwierdzone na żywym API), więc sama różnica czasu
 * musi wystarczyć jako sygnał; zweryfikowane na `/operations?withPlanned=true`
 * (które te pola NIESIE): obecność pola opóźnienia i „różnica nie jest
 * wielokrotnością doby" występowały zawsze razem, nigdy osobno.
 */
export function resolvePredictedTime(plannedAt: string | null, actualAt: string | null, isConfirmed: boolean): string | null {
  if (isConfirmed || plannedAt === null || actualAt === null) return null
  const diffMs = new Date(actualAt).getTime() - new Date(plannedAt).getTime()
  if (isNearDayMultiple(diffMs)) return null
  return actualAt
}
