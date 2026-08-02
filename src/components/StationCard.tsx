'use client'

import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'
import { getCarrierInfo } from '@/lib/carriers'
import { pluralPl } from '@/lib/plural'
import type { StationOption } from './StationSearch'
import type { BoardApiSnapshot } from '@/hooks/useBoard'

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
  onExpand: (station: StationOption) => void
  onRemove: () => void
}

export function StationCard({ stationId, stationName, snapshot, error, configError, onExpand, onRemove }: Props) {
  const departures = snapshot?.departures.slice(0, 3) ?? []
  const delayedCount = snapshot?.departures.filter((row) => row.status === 'delayed').length ?? 0

  if (configError) {
    return <ConfigErrorBanner />
  }

  // Cała kafelka jest klikalna, ale przyciskiem jest wyłącznie przezroczysta
  // nakładka. Gdyby <button> obejmował treść, byłby to niepoprawny HTML
  // (przycisk przyjmuje tylko phrasing content), nagłówek zniknąłby z nawigacji
  // po nagłówkach, a czytnik ekranu przeczytałby całą zawartość karty jako
  // nazwę przycisku.
  return (
    <article className="glass relative w-full rounded-2xl p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-within:ring-2 focus-within:ring-indigo-500">
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

      <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
        {!snapshot && !error && <li className="py-2 text-sm text-gray-500 dark:text-gray-400">Ładowanie…</li>}
        {snapshot && departures.length === 0 && (
          <li className="py-2 text-sm text-gray-500 dark:text-gray-400">Brak odjazdów w najbliższych godzinach</li>
        )}
        {departures.map((row) => (
          <li key={`${row.trainNumber}-${row.plannedAt}`} className="py-2 text-sm first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                <CarrierLogo carrierCode={row.carrier} size={16} />
                <span className="truncate">{getCarrierInfo(row.carrier)?.name ?? (row.carrier || 'Nieznany przewoźnik')}</span>
              </span>
              <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
            </div>
            <div className="mt-0.5 text-gray-500 dark:text-gray-400">
              {row.trainNumber} → {row.headsign}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onExpand({ id: stationId, name: stationName })}
        aria-label={`Pokaż pełną tablicę: ${stationName}`}
        className="absolute inset-0 rounded-2xl focus:outline-none"
      />
    </article>
  )
}
