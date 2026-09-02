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
 * Identyfikator miasta w warstwie GTFS — segment trasy (`/miasto/[city]`)
 * i klucz do rejestru miast, który wybiera feed. Musi być sprawdzony wobec
 * rejestru u wejścia każdego handlera GTFS: to on decyduje, skąd pobieramy dane.
 */
export const CITY_ID_PATTERN = /^[a-z]{2,8}$/

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
