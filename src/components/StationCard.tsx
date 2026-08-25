'use client'

import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardRowList } from './BoardRowList'
import { pluralPl } from '@/lib/plural'
import type { StationOption } from './StationSearch'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { CSSProperties } from 'react'
import type { RealizationStatus } from '@/lib/board/realization'

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
  onExpand: (station: StationOption) => void
  onRemove: () => void
}

// Kolor obwódki/poświaty karty wg statusu najbliższego odjazdu (decyzja #11
// w globals.css — `glow-ring` czyta `--glow-color` z inline style).
const GLOW_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.16)',
  delayed: 'rgba(234,88,12,0.2)',
  cancelled: 'rgba(225,29,72,0.2)',
  enRoute: 'rgba(79,70,229,0.16)',
  notStarted: 'rgba(2,132,199,0.14)',
  unknown: 'rgba(51,65,85,0.1)',
}
const BORDER_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.4)',
  delayed: 'rgba(234,88,12,0.45)',
  cancelled: 'rgba(225,29,72,0.45)',
  enRoute: 'rgba(79,70,229,0.4)',
  notStarted: 'rgba(2,132,199,0.35)',
  unknown: 'var(--surface-border)',
}

export function StationCard({ stationId, stationName, snapshot, error, configError, onExpand, onRemove }: Props) {
  const now = useSnapshotNow(snapshot)

  // Kafelek dashboardu pokazuje tylko nadchodzące połączenia — pociągi, które
  // już odjechały (mieszczące się w oknie 5 minut wstecz z transform.ts),
  // zostają wyłącznie w pełnej tablicy (FullBoard), gdzie są przygaszone.
  const departures = (snapshot?.departures.filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, 3)
  const delayedCount = snapshot?.departures.filter((row) => row.status === 'delayed').length ?? 0
  const leadStatus = departures[0]?.status ?? 'unknown'

  if (configError) {
    return <ConfigErrorBanner />
  }

  // Cała kafelka jest klikalna, ale przyciskiem jest wyłącznie przezroczysta
  // nakładka. Gdyby <button> obejmował treść, byłby to niepoprawny HTML
  // (przycisk przyjmuje tylko phrasing content), nagłówek zniknąłby z nawigacji
  // po nagłówkach, a czytnik ekranu przeczytałby całą zawartość karty jako
  // nazwę przycisku.
  return (
    <article
      data-status={leadStatus}
      className="glow-ring card-hover relative w-full overflow-hidden rounded-2xl border p-5 text-left transition duration-200 focus-within:ring-2 focus-within:ring-indigo-500"
      style={
        {
          borderColor: BORDER_COLOR[leadStatus],
          '--glow-color': GLOW_COLOR[leadStatus],
        } as CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">{stationName}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {delayedCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {delayedCount} {pluralPl(delayedCount, 'opóźniony', 'opóźnione', 'opóźnionych')}
            </span>
          )}
          {/* z-10 stawia przycisk nad nakładką rozwijającą tablicę, która
              w drzewie stoi później i domyślnie przykryłaby go w całości. */}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Usuń z ulubionych: ${stationName}`}
            className="relative z-10 grid h-7 w-7 place-items-center rounded-full text-gray-400 transition hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <p aria-live="polite" className="mt-1 text-xs text-red-600 dark:text-red-400">
          Błąd pobierania danych
        </p>
      )}

      <BoardRowList
        rows={departures}
        loading={!snapshot && !error}
        showEmpty={snapshot !== null && departures.length === 0}
        emptyMessage="Brak odjazdów w najbliższych godzinach"
      />

      <button
        type="button"
        onClick={() => onExpand({ id: stationId, name: stationName })}
        aria-label={`Pokaż pełną tablicę: ${stationName}`}
        className="absolute inset-0 rounded-2xl focus:outline-none"
      />
    </article>
  )
}
