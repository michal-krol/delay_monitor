/**
 * Wzorce współdzielone między route handlerami (`/api/board`, `/api/train`)
 * a odczytem stanu widoku z adresu URL po stronie klienta (`page.tsx`,
 * `FullBoard.tsx`). Jedno miejsce, żeby walidacja identyfikatorów trafiających
 * do zapytań kierowanych do PKP nigdy się nie rozjechała.
 */

/**
 * Identyfikatory stacji w API PKP są liczbami (schemat sprowadza je do stringów
 * przez `z.coerce.string()`). Trzymamy się tego formatu ściśle: identyfikator
 * trafia do zapytania kierowanego do PKP, więc wszystko poza cyframi to albo
 * pomyłka, albo próba wstrzyknięcia parametrów.
 */
export const STATION_ID_PATTERN = /^\d{1,10}$/

/** Data kursowania (yyyy-MM-dd) — parametr `/api/train` i `/operations/train/...`. */
export const OPERATING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Slug miasta w warstwie GTFS — pełna nazwa bez polskich znaków (`warszawa`,
 * `krakow`), segment trasy (`/city/[city]`) i klucz do rejestru miast, który
 * wybiera feed. Musi być sprawdzony wobec rejestru u wejścia każdego handlera
 * GTFS: to on decyduje, skąd pobieramy dane. Tylko małe litery ASCII — trafia
 * do adresu URL i do kluczy `Map`.
 */
export const CITY_ID_PATTERN = /^[a-z]{2,24}$/

/**
 * Identyfikatory przystanków GTFS NIE są liczbami (inaczej niż w PKP):
 * `100101` (zespół+słupek), `7014M` (stacja metra), `7014M:P1` (peron metra).
 * Osobny wzorzec, NIE rozluźnienie `STATION_ID_PATTERN` — tamten chroni
 * identyfikatory trafiające do zapytań kierowanych do PKP i musi zostać ścisły.
 *
 * W odróżnieniu od PKP identyfikator GTFS nigdy nie trafia do wychodzącego
 * URL-a — jest wyłącznie kluczem do naszej własnej `Map`. Realną granicą
 * zaufania jest `stopIndexById.get(id) === undefined → null`; ten regex to tani
 * strażnik formatu i długości.
 */
export const GTFS_STOP_ID_PATTERN = /^[A-Za-z0-9]{1,12}(?::[A-Za-z0-9]{1,6})?$/

/**
 * `:` w GTFS stop ID (peron metra, `7014M:P1`) łamie hydrację dynamicznego
 * segmentu Next.js 16.2.12 w komponencie klienckim (`useParams()`): drzewo
 * routera przenosi wartość parametru jako klucz cache'a zakodowany
 * `encodeURIComponent` (`node_modules/next/dist/client/route-params.js`,
 * `canonicalizeURLPart`/`getParamValueFromCacheKey`), ale klient nigdy go nie
 * dekoduje z powrotem — `useParams()` dostaje dosłowne `"7014M%3AP1"`, więc
 * `GTFS_STOP_ID_PATTERN` odrzuca i strona 404-uje. Dotyczy WYŁĄCZNIE `:` —
 * to jedyny znak w tym formacie, którego `encodeURIComponent` w ogóle rusza
 * (`-`, `.`, `_` są dla niego identycznością). Budując segment ścieżki
 * (`/city/[city]/stop/[stopId]`) podmieniamy `:` na `-` (nieużywane gdzie
 * indziej w tym formacie) — segment przechodzi przez Next niezmieniony,
 * `decodeStopIdFromPathSegment` odwraca podmianę po stronie strony.
 */
export function encodeStopIdForPathSegment(stopId: string): string {
  return stopId.replace(':', '-')
}

export function decodeStopIdFromPathSegment(pathSegment: string): string {
  return pathSegment.replace('-', ':')
}

/**
 * Identyfikator linii GTFS (`route_id`) — `M1`, `521`, `N16`, `L-1`. Jak przy
 * przystankach: nigdy nie trafia do wychodzącego URL-a, jest kluczem do naszej
 * `Map`; realną granicą zaufania jest `routeIndexById.get(id) === undefined`.
 * Ten regex to tani strażnik formatu i długości.
 */
export const GTFS_ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,39}$/
