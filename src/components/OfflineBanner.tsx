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
  const now = useNow(30_000)
  if (online) return null

  return (
    <div
      role="status"
      className="glass-strong text-warning-text fixed left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap"
      style={{ bottom: 'calc(var(--bottom-nav-h) + 0.75rem)' }}
    >
      {offlineMessage(lastPollingSuccessAt(), now)}
    </div>
  )
}
