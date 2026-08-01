'use client'

import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import type { StationOption } from './StationSearch'

type Props = {
  stationId: string
  stationName: string
  onExpand: (station: StationOption) => void
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return `${seconds}s temu`
  return `${Math.floor(seconds / 60)}min temu`
}

export function StationCard({ stationId, stationName, onExpand }: Props) {
  const { data, error } = useBoard([stationId])
  const snapshot = data?.snapshots[0] ?? null
  const departures = snapshot?.departures.slice(0, 3) ?? []
  const delayedCount = snapshot?.departures.filter((row) => row.status === 'delayed').length ?? 0

  if (data?.status === 'configError') {
    return <ConfigErrorBanner />
  }

  return (
    <button
      type="button"
      onClick={() => onExpand({ id: stationId, name: stationName })}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stationName}</h2>
        {delayedCount > 0 && (
          <span className="text-sm text-amber-700 dark:text-amber-300">{delayedCount} opóźnionych</span>
        )}
      </div>

      <p aria-live="polite" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {error ? 'Błąd pobierania danych' : snapshot ? `Dane sprzed ${formatAge(snapshot.ageMs)}` : 'Ładowanie…'}
      </p>

      <ul className="mt-3 space-y-2">
        {snapshot && departures.length === 0 && (
          <li className="text-sm text-gray-500 dark:text-gray-400">Brak odjazdów w najbliższych godzinach</li>
        )}
        {departures.map((row) => (
          <li key={`${row.trainNumber}-${row.plannedAt}`} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {row.trainNumber} → {row.headsign}
            </span>
            <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
          </li>
        ))}
      </ul>
    </button>
  )
}
