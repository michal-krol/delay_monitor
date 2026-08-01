'use client'

import { useState } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

type Direction = 'departures' | 'arrivals'

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  const { data, error } = useBoard([stationId])
  const snapshot = data?.snapshots[0] ?? null
  const rows = snapshot ? snapshot[direction] : []

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      {data?.status === 'configError' && <ConfigErrorBanner />}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stationName}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleFavourite}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            {isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Zamknij
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Kierunek" className="mt-4 flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'departures'}
          onClick={() => setDirection('departures')}
          className={`rounded px-3 py-1 text-sm ${direction === 'departures' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
        >
          Odjazdy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'arrivals'}
          onClick={() => setDirection('arrivals')}
          className={`rounded px-3 py-1 text-sm ${direction === 'arrivals' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
        >
          Przyjazdy
        </button>
      </div>

      <p aria-live="polite" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {error ? 'Błąd pobierania danych' : snapshot ? `Dane sprzed ${Math.floor(snapshot.ageMs / 1000)}s` : 'Ładowanie…'}
      </p>

      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">
          {direction === 'departures' ? 'Odjazdy' : 'Przyjazdy'} — {stationName}
        </caption>
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th scope="col" className="py-2 pr-2">Pociąg</th>
            <th scope="col" className="py-2 pr-2">Kierunek</th>
            <th scope="col" className="py-2 pr-2">Planowo</th>
            <th scope="col" className="py-2 pr-2">Peron</th>
            <th scope="col" className="py-2 pr-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-gray-500 dark:text-gray-400">
                Brak odjazdów w najbliższych godzinach
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={`${row.trainNumber}-${row.plannedAt}`} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-2 pr-2">{row.category} {row.trainNumber}</td>
              <td className="py-2 pr-2">{row.headsign}</td>
              <td className="py-2 pr-2">
                {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 pr-2">{row.platform ?? '—'}</td>
              <td className="py-2 pr-2">
                <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
