import type { BoardApiResponse } from '@/hooks/useBoard'
import { effectiveAgeMs, formatAge, formatAgo } from '@/lib/format'
import { useNow } from '@/hooks/useNow'

type Props = {
  fetchedAt: string | undefined
  ageMs: number | undefined
  /** Kiedy klient dostał tę odpowiedź (ms epoch); `ageMs` zamarza w tym momencie, więc wiek rośnie od niego. */
  lastSuccessAt?: number | null
  data: BoardApiResponse | null
  error: boolean
  /**
   * Podany = wiek danych jest przyciskiem „odśwież teraz” (ten sam hook, `/api/board` czyta
   * snapshot pollera — zero zapytań do PKP, AGENTS.md #3).
   */
  onRefresh?: () => void
}

/**
 * Wiek danych powyżej tego progu opisujemy słownie. Poller chodzi co 90 s,
 * więc 3 minuty to już druga nieudana runda — coś się dzieje.
 */
const STALE_AFTER_MS = 3 * 60 * 1000


/** Tablica PKP jest zawsze warszawska (AGENTS.md #1) — jawna strefa, żeby widz spoza PL widział ten sam czas co dane. */
function formatLastUpdated(fetchedAt: string): string {
  return new Date(fetchedAt).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
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
// Na telefonie schowany: kompaktowy nagłówek tablicy ma zostawić miejsce na pierwszy odjazd.
const REFRESH_HINT = <span className="max-sm:hidden">Dane odświeżają się automatycznie co ok. 1,5 minuty.</span>

/** Wiek podajemy z dokładnością do minuty, więc tykanie co 30 s wystarcza. */
const AGE_TICK_MS = 30_000

export function BoardStatus({ fetchedAt, ageMs: responseAgeMs, lastSuccessAt, data, error, onRefresh }: Props) {
  const now = useNow(AGE_TICK_MS)
  const ageMs = effectiveAgeMs(responseAgeMs, lastSuccessAt, now)
  // Baner błędu zastępuje CAŁĄ linijkę statusu tylko, gdy nie ma jeszcze
  // żadnego znanego snapshotu do pokazania -- inaczej ukrywałby wiek danych,
  // które w tle nadal są widoczne w tabeli (patrz AGENTS.md #7: awaria ma być
  // rosnącym wiekiem danych, nie pustym/zablokowanym widokiem). Gdy fetchedAt
  // już jest znany, błąd bieżącego odświeżenia dokłada się jako kolejny chip
  // obok wieku danych, nie zamiast niego.
  if (fetchedAt === undefined) {
    if (error) {
      return (
        <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
          <span className="text-error-text">Błąd pobierania danych</span>
          {REFRESH_HINT}
        </p>
      )
    }
    return (
      <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span>Wczytywanie…</span>
        {REFRESH_HINT}
      </p>
    )
  }

  const isStale = ageMs !== undefined && ageMs >= STALE_AFTER_MS
  const hint = budgetHint(data)

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
      {onRefresh !== undefined && ageMs !== undefined ? (
        <button
          type="button"
          onClick={onRefresh}
          title={`Ostatnia aktualizacja: ${formatLastUpdated(fetchedAt)}`}
          className="inline-flex items-center rounded-full underline decoration-dotted underline-offset-2 transition hover:text-foreground max-sm:min-h-11"
        >
          Aktualizacja {formatAgo(ageMs / 1000)}
          {' '}
          <span className="sr-only">— odśwież teraz</span>
        </button>
      ) : (
        <span>Ostatnia aktualizacja: {formatLastUpdated(fetchedAt)}</span>
      )}
      {REFRESH_HINT}

      {/* `display: contents` -- węzeł istnieje dla `aria-live`, ale nie wchodzi
          we flex-wrap rodzica (chipy układają się tak samo jak wcześniej). */}
      <span className="contents" aria-live="polite">
        {/* Ostrzeżenie, nie błąd: ostatni dobry snapshot wciąż jest na ekranie (#7), jak w `ScheduleStatus`. */}
        {error && <span className="text-warning-text">Błąd ostatniego odświeżenia</span>}

        {isStale && <span className="text-warning-text">dane sprzed {formatAge(ageMs)}</span>}

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
            <span className="text-warning-text">
              PKP nie podaje dziś danych o ruchu — godziny wg rozkładu, możliwe niewidoczne odwołania
            </span>
          ) : data.realizationIncomplete === true ? (
            /* Poller nie dociągnął wszystkich stron `/operations` (budżet / limit
               stron) -- część pociągów jest bez realizacji i renderuje się jako
               „jeszcze nie wyjechał" mimo że jedzie. Reszta tablicy (godziny,
               perony, pociągi z realizacją) jest aktualna. */
            <span className="text-warning-text">
              Duży ruch — część pociągów może być pokazana jako „jeszcze nie wyjechał”, mimo że jadą
            </span>
          ) : (
            <span className="text-warning-text">API nie odpowiada — pokazujemy ostatnie znane dane</span>
          ))}

        {data?.throttled === true && (
          <span className="text-warning-text" title={hint}>
            odświeżanie ograniczone
            {hint !== undefined && <span className="sr-only"> {hint}</span>}
          </span>
        )}
      </span>
    </p>
  )
}
