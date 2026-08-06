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
