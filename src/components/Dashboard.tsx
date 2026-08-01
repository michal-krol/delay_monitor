'use client'

import { useBoard } from '@/hooks/useBoard'
import { StationCard } from './StationCard'
import type { StationOption } from './StationSearch'
import type { Favourite } from '@/hooks/useFavourites'

type Props = {
  favourites: Favourite[]
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

export function Dashboard({ favourites, onExpand }: Props) {
  const stationIds = favourites.map((favourite) => favourite.id)
  const { data, error } = useBoard(stationIds)

  const received = (data?.snapshots ?? []).filter((snapshot) => snapshot !== null)

  // Łączenie po stationId, nie po pozycji w tablicy. Po zmianie ulubionych
  // `favourites` aktualizuje się natychmiast, a `data` jeszcze przez jeden cykl
  // trzyma poprzednią odpowiedź — przy dopasowaniu po indeksie karta pokazałaby
  // wtedy nazwę jednej stacji z odjazdami innej.
  const snapshotsById = new Map(received.map((snapshot) => [snapshot.stationId, snapshot]))

  const latestFetchedAt = received
    .map((snapshot) => snapshot.fetchedAt)
    .sort()
    .at(-1)

  return (
    <div>
      <p
        aria-live="polite"
        className="glass mb-4 inline-flex rounded-full px-3.5 py-1.5 text-xs text-gray-600 dark:text-gray-300"
      >
        {error
          ? 'Błąd pobierania danych'
          : latestFetchedAt
            ? `Ostatnia aktualizacja: ${formatLastUpdated(latestFetchedAt)}`
            : 'Ładowanie…'}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {favourites.map((favourite) => (
          <StationCard
            key={favourite.id}
            stationId={favourite.id}
            stationName={favourite.name}
            snapshot={snapshotsById.get(favourite.id) ?? null}
            error={error !== null}
            configError={data?.status === 'configError'}
            onExpand={onExpand}
          />
        ))}
      </div>
    </div>
  )
}
