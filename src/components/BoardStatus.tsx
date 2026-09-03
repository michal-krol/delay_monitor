import type { BoardApiResponse } from '@/hooks/useBoard'

type Props = {
  fetchedAt: string | undefined
  ageMs: number | undefined
  data: BoardApiResponse | null
  error: boolean
}

/**
 * Wiek danych powyżej tego progu opisujemy słownie. Poller chodzi co 90 s,
 * więc 3 minuty to już druga nieudana runda — coś się dzieje.
 */
const STALE_AFTER_MS = 3 * 60 * 1000

/** Kolor "coś wymaga uwagi, ale nie jest błędem" — dane sprzed chwili, degradacja, throttling. */
const WARNING_CLASS = 'text-amber-700 dark:text-amber-400'

function formatLastUpdated(fetchedAt: string): string {
  return new Date(fetchedAt).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

function budgetHint(data: BoardApiResponse | null): string | undefined {
  const daily = data?.budget?.daily
  if (daily === null || daily === undefined) return undefined
  return `Pozostało ${daily} zapytań do API na dobę`
}

/**
 * Linijka statusu nad tablicą i nad dashboardem.
 *
 * `aria-live="polite"` celowo NIE obejmuje tabeli (czytnik odczytywałby ją
 * przy każdym odświeżeniu) ANI linijki „Ostatnia aktualizacja: …" — ta tyka
 * co 30 s samym znacznikiem czasu, więc żywy region na niej to szum bez
 * treści. Region obejmuje wyłącznie chipy stanu, które pojawiają się rzadko
 * i wtedy są warte ogłoszenia: błąd, wiek danych, `degraded`, throttling.
 */
/** Statyczny fakt o tempie odświeżania -- ma być widoczny zawsze, niezależnie od stanu ładowania/błędu. */
const REFRESH_HINT = <span>Dane odświeżają się automatycznie co ok. 1,5 minuty.</span>

export function BoardStatus({ fetchedAt, ageMs, data, error }: Props) {
  // Baner błędu zastępuje CAŁĄ linijkę statusu tylko, gdy nie ma jeszcze
  // żadnego znanego snapshotu do pokazania -- inaczej ukrywałby wiek danych,
  // które w tle nadal są widoczne w tabeli (patrz AGENTS.md #7: awaria ma być
  // rosnącym wiekiem danych, nie pustym/zablokowanym widokiem). Gdy fetchedAt
  // już jest znany, błąd bieżącego odświeżenia dokłada się jako kolejny chip
  // obok wieku danych, nie zamiast niego.
  if (fetchedAt === undefined) {
    if (error) {
      return (
        <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="text-red-600 dark:text-red-400">Błąd pobierania danych</span>
          {REFRESH_HINT}
        </p>
      )
    }
    return (
      <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>Ładowanie…</span>
        {REFRESH_HINT}
      </p>
    )
  }

  const isStale = ageMs !== undefined && ageMs >= STALE_AFTER_MS

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      <span>Ostatnia aktualizacja: {formatLastUpdated(fetchedAt)}</span>
      {REFRESH_HINT}

      {/* `display: contents` -- węzeł istnieje dla `aria-live`, ale nie wchodzi
          we flex-wrap rodzica (chipy układają się tak samo jak wcześniej). */}
      <span className="contents" aria-live="polite">
        {error && <span className="text-red-600 dark:text-red-400">Błąd ostatniego odświeżenia</span>}

        {isStale && <span className={WARNING_CLASS}>dane sprzed {formatAge(ageMs)}</span>}

        {data?.status === 'degraded' &&
          (data.realizationStale === true ? (
            /* Rozkład jest świeży, brakuje wyłącznie informacji o ruchu. Komunikat
               „pokazujemy ostatnie znane dane" byłby tu nieprawdą -- godziny
               i perony są aktualne, nieznane są opóźnienia.
               Dopisek o odwołaniach nie jest ozdobą: `isCancelled` istnieje
               wyłącznie w `/operations` (rozkład nie ma pola o odwołaniu), więc
               w tym stanie odwołany dziś pociąg wygląda jak normalny kurs.
               Poważniejsze niż `realizationIncomplete` niżej (brak CAŁEGO dnia,
               nie kawałka) -- dlatego sprawdzane pierwsze. */
            <span className={WARNING_CLASS}>
              PKP nie podaje dziś danych o ruchu — godziny wg rozkładu, możliwe niewidoczne odwołania
            </span>
          ) : data.realizationIncomplete === true ? (
            /* Poller nie dociągnął wszystkich stron `/operations` (budżet / limit
               stron) -- część pociągów jest bez realizacji i renderuje się jako
               „jeszcze nie wyjechał" mimo że jedzie. Reszta tablicy (godziny,
               perony, pociągi z realizacją) jest aktualna. */
            <span className={WARNING_CLASS}>
              Duży ruch — część pociągów może być pokazana jako „jeszcze nie wyjechał”, mimo że jadą
            </span>
          ) : (
            <span className={WARNING_CLASS}>API nie odpowiada — pokazujemy ostatnie znane dane</span>
          ))}

        {data?.throttled === true && (
          <span className={WARNING_CLASS} title={budgetHint(data)}>
            odświeżanie ograniczone
          </span>
        )}
      </span>
    </p>
  )
}
