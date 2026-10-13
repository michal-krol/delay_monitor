'use client'

import { useNow } from '@/hooks/useNow'
import { formatAgo } from '@/lib/format'

/** Wiek podajemy co najwyżej do sekundy, ale tykanie co 30 s wystarcza (jak `BoardStatus`). */
const AGE_TICK_MS = 30_000

/**
 * Linijka „Pobrano …” nad listą odjazdów miejskich. To moment, w którym PRZEGLĄDARKA dostała ostatnią dobrą
 * odpowiedź (`lastSuccessAt`), nie wiek feedu źródła — stąd etykieta „Pobrano”. Cała linijka jest przyciskiem
 * „odśwież teraz” (`usePolling().refresh`, to samo `/api/gtfs/board`, zero nowych zapytań).
 * Nieudane odświeżenie z zachowanym wynikiem (#7): ostatnie dane zostają, a linijka mówi, z której godziny są.
 */
export function TransitFetchStatus({
  lastSuccessAt,
  refreshFailed,
  timeZone,
  onRefresh,
}: {
  lastSuccessAt: number | null
  /** Ostatnie odświeżenie padło, ale lista na ekranie to ostatni dobry wynik. */
  refreshFailed: boolean
  timeZone: string
  onRefresh: () => void
}) {
  const now = useNow(AGE_TICK_MS)
  if (lastSuccessAt === null) return null
  const label = refreshFailed
    ? `Nie udało się odświeżyć · dane z ${new Date(lastSuccessAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone })}`
    : `Pobrano ${formatAgo(Math.max(0, now - lastSuccessAt) / 1000)}`
  return (
    <p className="mt-2 text-sm text-text-secondary">
      <button
        type="button"
        onClick={onRefresh}
        className={`control-44 -mx-1 inline-flex items-center rounded-lg px-1 underline decoration-dotted underline-offset-2 transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary-text ${refreshFailed ? 'font-medium text-warning-text' : ''}`}
      >
        {label}
        <span className="sr-only"> — odśwież teraz</span>
      </button>
    </p>
  )
}
