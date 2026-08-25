'use client'

import { useBoard } from '@/hooks/useBoard'
import { StationCard } from './StationCard'
import { FocusedStation } from './FocusedStation'
import { BoardStatus } from './BoardStatus'
import type { StationOption } from './StationSearch'
import type { Favourite } from '@/hooks/useFavourites'

type Props = {
  favourites: Favourite[]
  onExpand: (station: StationOption) => void
  onRemove: (stationId: string) => void
  focusedStationId: string | null
  onSeeAll: (station: StationOption) => void
  onCloseFocus: () => void
}

export function Dashboard({ favourites, onExpand, onRemove, focusedStationId, onSeeAll, onCloseFocus }: Props) {
  const stationIds = favourites.map((favourite) => favourite.id)
  const { data, error } = useBoard(stationIds)

  const received = (data?.snapshots ?? []).filter((snapshot) => snapshot !== null)

  // Łączenie po stationId, nie po pozycji w tablicy. Po zmianie ulubionych
  // `favourites` aktualizuje się natychmiast, a `data` jeszcze przez jeden cykl
  // trzyma poprzednią odpowiedź — przy dopasowaniu po indeksie karta pokazałaby
  // wtedy nazwę jednej stacji z odjazdami innej.
  const snapshotsById = new Map(received.map((snapshot) => [snapshot.stationId, snapshot]))

  // Najświeższy snapshot reprezentuje cały dashboard: wszystkie stacje jadą
  // na jednym przebiegu pollera, więc rozjazd między nimi bywa najwyżej
  // jednorundowy — dla stacji dodanej przed chwilą.
  const freshest = received.reduce<(typeof received)[number] | undefined>(
    (best, snapshot) => (best === undefined || snapshot.fetchedAt > best.fetchedAt ? snapshot : best),
    undefined
  )

  // Nieznane/odpięte ID (zły format URL-a, stacja odpięta w międzyczasie)
  // po prostu nie znajduje dopasowania — cichy powrót do siatki, bez błędu.
  const focused = focusedStationId ? favourites.find((favourite) => favourite.id === focusedStationId) : undefined

  return (
    <div>
      <div className="glass mb-5 inline-flex rounded-full px-3.5 py-1.5">
        <BoardStatus fetchedAt={freshest?.fetchedAt} ageMs={freshest?.ageMs} data={data} error={error !== null} />
      </div>
      {focused ? (
        <FocusedStation
          stationName={focused.name}
          snapshot={snapshotsById.get(focused.id) ?? null}
          error={error !== null}
          configError={data?.status === 'configError'}
          onSeeAll={() => onSeeAll({ id: focused.id, name: focused.name })}
          onClose={onCloseFocus}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favourites.map((favourite) => (
            <StationCard
              key={favourite.id}
              stationId={favourite.id}
              stationName={favourite.name}
              snapshot={snapshotsById.get(favourite.id) ?? null}
              error={error !== null}
              configError={data?.status === 'configError'}
              onExpand={onExpand}
              onRemove={() => onRemove(favourite.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
