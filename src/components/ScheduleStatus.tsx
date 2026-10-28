'use client'

import type { TransitBoardResponse } from '@/hooks/useTransitBoard'
import { useHeaderData } from './pageHeader'

type Props = {
  schedule: TransitBoardResponse['schedule']
  cityName: string
  /** Source label in the shared header's data details. */
  title?: string
  /** Failed refresh keeps the last successful snapshot. */
  error?: boolean
  /** Register metadata only, without a repeated body warning. */
  quiet?: boolean
  /** Retained for existing callers; timestamps now belong to the shared header. */
  compact?: boolean
}

/**
 * Statyczny rozkład zmienia się raz na dobę (nowy feed), więc „dane sprzed 3 h" to norma, nie ostrzeżenie.
 * Ostrzegamy dopiero po dobie bez odświeżenia; wcześniejszy problem zgłasza `state: 'failed'` albo błąd sieci.
 */
const STALE_MS = 24 * 60 * 60 * 1000

/** Czy stan rozkładu wymaga uwagi: wczytywanie, nieudane odświeżanie, dane starsze niż doba albo błąd sieci. */
export function scheduleNeedsAttention(schedule: Props['schedule'], error: boolean): boolean {
  return schedule.state === 'loading' || schedule.state === 'failed' || error || (schedule.ageMs !== null && schedule.ageMs >= STALE_MS)
}

const PHASE_LABEL: Record<string, string> = {
  start: 'start',
  feed_info: 'wersja feedu',
  tabele: 'przystanki i linie',
  stop_times: 'rozkład przejazdów',
  shapes: 'kształty tras',
  weryfikacja: 'weryfikacja',
}

/**
 * Linijka stanu rozkładu miejskiego. Pomiar lokalny: całe ładowanie to rząd
 * kilkunastu sekund, więc `loading` jest zaprojektowanym stanem z widoczną
 * FAZĄ (nazwa fazy niepokoi mniej niż licznik sekund). `droppedRows` nie ma
 * w tej odpowiedzi — trójstan jest w `/api/health`.
 */
export function ScheduleStatus({ schedule, cityName, title, error = false, quiet = false }: Props) {
  useHeaderData({
    id: `gtfs-schedule:${cityName}`,
    label: title ?? `Rozkład — ${cityName}`,
    updatedAt: schedule.loadedAt,
    error: schedule.state === 'failed' || error,
    warning: schedule.ageMs !== null && schedule.ageMs >= STALE_MS ? 'Rozkład wymaga aktualizacji' : undefined,
  })

  if (schedule.state === 'loading') {
    return (
      <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          Wczytywanie rozkładu — {cityName}
          {schedule.phase !== null && <span className="text-text-muted">· {PHASE_LABEL[schedule.phase] ?? schedule.phase}</span>}
        </span>
      </p>
    )
  }

  const stale = schedule.ageMs !== null && schedule.ageMs >= STALE_MS
  if (quiet || (schedule.state === 'ready' && !stale && !error)) return null

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
      {!quiet && (
        <span className="contents" aria-live="polite">
          {(schedule.state === 'failed' || stale) && schedule.ageMs !== null && (
            <span className="text-warning-text">Rozkład wymaga aktualizacji</span>
          )}
          {schedule.state === 'failed' && <span className="text-warning-text">odświeżanie nie powiodło się</span>}
          {error && schedule.state !== 'failed' && (
            <span className="text-warning-text">błąd ostatniego odświeżenia</span>
          )}
        </span>
      )}
    </p>
  )
}
