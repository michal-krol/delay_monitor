'use client'

import { useState } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

type Direction = 'departures' | 'arrivals'

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

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  const { data, error } = useBoard([stationId])
  const snapshot = data?.snapshots[0] ?? null
  const rows = snapshot ? snapshot[direction] : []

  return (
    <section className="glass rounded-2xl p-5">
      {data?.status === 'configError' && <ConfigErrorBanner />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{stationName}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleFavourite}
            className="rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-black/10 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/15"
          >
            {isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-black/10 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/15"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Kierunek"
        className="mt-4 inline-flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'departures'}
          onClick={() => setDirection('departures')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            direction === 'departures'
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
          }`}
        >
          Odjazdy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'arrivals'}
          onClick={() => setDirection('arrivals')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            direction === 'arrivals'
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
          }`}
        >
          Przyjazdy
        </button>
      </div>

      <p aria-live="polite" className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {error
          ? 'Błąd pobierania danych'
          : snapshot
            ? `Ostatnia aktualizacja: ${formatLastUpdated(snapshot.fetchedAt)}`
            : 'Ładowanie…'}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            {direction === 'departures' ? 'Odjazdy' : 'Przyjazdy'} — {stationName}
          </caption>
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Pociąg</th>
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Przewoźnik</th>
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Kierunek</th>
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Planowo</th>
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Peron</th>
              <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
                  {direction === 'departures'
                    ? 'Brak odjazdów w najbliższych godzinach'
                    : 'Brak przyjazdów w najbliższych godzinach'}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={`${row.trainNumber}-${row.plannedAt}`}
                className="border-b border-black/5 transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
              >
                <td className="py-2.5 pr-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                  {row.category ? `${row.category} ${row.trainNumber}` : row.trainNumber}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                    <CarrierLogo carrierCode={row.carrier} size={16} />
                    <span>{row.carrier || '—'}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{row.headsign}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{row.platform ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
