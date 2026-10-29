'use client'

import { useHeaderData } from './pageHeader'

/**
 * Registers when the browser received its last successful response, separately from static feed loading.
 * The header owns its absolute timestamp and refresh action; a failed refresh keeps a visible warning.
 */
export function TransitFetchStatus({
  lastSuccessAt,
  refreshFailed,
  onRefresh,
  sourceId = 'gtfs-board',
  sourceLabel = 'Odjazdy miejskie',
}: {
  lastSuccessAt: number | null
  /** Ostatnie odświeżenie padło, ale lista na ekranie to ostatni dobry wynik. */
  refreshFailed: boolean
  timeZone: string
  onRefresh: () => void
  sourceId?: string
  sourceLabel?: string
}) {
  useHeaderData({ id: sourceId, label: sourceLabel, updatedAt: lastSuccessAt, error: refreshFailed, refresh: onRefresh })
  if (!refreshFailed || lastSuccessAt === null) return null
  return (
    <p role="status" className="mt-2 text-sm text-warning-text">
      Nie udało się odświeżyć — pokazujemy ostatnie dane.
    </p>
  )
}
