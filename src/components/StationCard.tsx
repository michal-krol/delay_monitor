'use client'

import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'
import { getCarrierInfo } from '@/lib/carriers'
import type { StationOption } from './StationSearch'

type Props = {
  stationId: string
  stationName: string
  onExpand: (station: StationOption) => void
}

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
        {error
          ? 'Błąd pobierania danych'
          : snapshot
            ? `Ostatnia aktualizacja: ${formatLastUpdated(snapshot.fetchedAt)}`
            : 'Ładowanie…'}
      </p>

      <ul className="mt-3 space-y-2">
        {snapshot && departures.length === 0 && (
          <li className="text-sm text-gray-500 dark:text-gray-400">Brak odjazdów w najbliższych godzinach</li>
        )}
        {departures.map((row) => (
          <li key={`${row.trainNumber}-${row.plannedAt}`} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                <CarrierLogo carrierCode={row.carrier} size={16} />
                <span className="truncate">{getCarrierInfo(row.carrier)?.name ?? (row.carrier || 'Nieznany przewoźnik')}</span>
              </span>
              <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              {row.trainNumber} → {row.headsign}
            </div>
          </li>
        ))}
      </ul>
    </button>
  )
}
