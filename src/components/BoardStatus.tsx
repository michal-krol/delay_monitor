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
 * aria-live="polite" celowo obejmuje wyłącznie ten fragment, nie tabelę —
 * inaczej czytnik ekranu odczytywałby całą tablicę przy każdym odświeżeniu.
 */
export function BoardStatus({ fetchedAt, ageMs, data, error }: Props) {
  if (error) {
    return (
      <p aria-live="polite" className="text-xs text-red-600 dark:text-red-400">
        Błąd pobierania danych
      </p>
    )
  }

  if (fetchedAt === undefined) {
    return (
      <p aria-live="polite" className="text-xs text-gray-500 dark:text-gray-400">
        Ładowanie…
      </p>
    )
  }

  const isStale = ageMs !== undefined && ageMs >= STALE_AFTER_MS

  return (
    <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
      <span>Ostatnia aktualizacja: {formatLastUpdated(fetchedAt)}</span>

      {isStale && <span className={WARNING_CLASS}>dane sprzed {formatAge(ageMs)}</span>}

      {data?.status === 'degraded' && (
        <span className={WARNING_CLASS}>API nie odpowiada — pokazujemy ostatnie znane dane</span>
      )}

      {data?.throttled === true && (
        <span className={WARNING_CLASS} title={budgetHint(data)}>
          odświeżanie ograniczone
        </span>
      )}
    </p>
  )
}
