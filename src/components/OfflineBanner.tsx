'use client'

import { lastPollingSuccessAt } from '@/hooks/usePolling'
import { useNow } from '@/hooks/useNow'
import { useOnline } from '@/hooks/useOnline'

/** Komunikat offline z wiekiem ostatnich danych (AGENTS.md #7); `null` = nic jeszcze nie pobrano. */
export function offlineMessage(lastSuccessAt: number | null, nowMs: number): string {
  if (lastSuccessAt === null) return 'Brak połączenia z internetem'
  const minutes = Math.max(1, Math.round((nowMs - lastSuccessAt) / 60_000))
  return `Brak połączenia — dane sprzed ${minutes} min`
}

/**
 * Pastylka nad dolnym paskiem, gdy przeglądarka jest offline. Strona nadal pokazuje ostatni
 * udany stan (hooki danych bez zmian) — baner tylko mówi, jak stare są dane.
 */
export function OfflineBanner() {
  const online = useOnline()
  // Region `status` jest w DOM od początku (pusty) — czytnik ogłasza dopiero zmianę treści, a nie
  // wstawiony od razu wypełniony węzeł. Zegar (`useNow`) żyje tylko w pastylce, więc online nic nie tyka.
  return <div role="status">{!online && <OfflinePill />}</div>
}

function OfflinePill() {
  const now = useNow(30_000)
  return (
    <div
      className="glass-strong text-warning-text fixed left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm font-medium"
      style={{ bottom: 'calc(var(--bottom-nav-h) + 0.75rem)' }}
    >
      {offlineMessage(lastPollingSuccessAt(), now)}
    </div>
  )
}
