'use client'

import { useBoard } from '@/hooks/useBoard'
import { StationCard } from './StationCard'
import { TransitStopCard } from './TransitStopCard'
import { BoardStatus } from './BoardStatus'
import type { StationOption } from './StationSearch'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'

type Props = {
  pinnedItems: PinnedItem[]
  onExpand: (station: StationOption) => void
  onRemove: (key: string) => void
}

export function Dashboard({ pinnedItems, onExpand, onRemove }: Props) {
  // Pulpit jest ponad miastami: stacja PKP i przystanek miejski (dowolnego
  // miasta) wiszą obok siebie na jednej siatce. Stacje idą przez wspólny
  // `useBoard` (jedno zapytanie), przystanki miejskie mają własne karty.
  const stations = pinnedItems.filter((pinnedItem) => pinnedItem.kind === 'pkp')
  const transitStops = pinnedItems.filter((pinnedItem) => pinnedItem.kind === 'gtfs')
  const stationIds = stations.map((pinnedItem) => pinnedItem.id)
  const { data, error, lastSuccessAt } = useBoard(stationIds)

  const received = (data?.snapshots ?? []).filter((snapshot) => snapshot !== null)

  // Łączenie po stationId, nie po pozycji w tablicy. Po zmianie przypiętych
  // `pinnedItems` aktualizuje się natychmiast, a `data` jeszcze przez jeden cykl
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

  return (
    <div>
      <div className="glass mb-5 inline-flex rounded-full px-3.5 py-1.5">
        <BoardStatus fetchedAt={freshest?.fetchedAt} ageMs={freshest?.ageMs} lastSuccessAt={lastSuccessAt} data={data} error={error !== null} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-5">
        {stations.map((pinnedItem) => (
          <StationCard
            key={pinnedItem.id}
            stationId={pinnedItem.id}
            stationName={pinnedItem.name}
            snapshot={snapshotsById.get(pinnedItem.id) ?? null}
            error={error !== null}
            configError={data?.status === 'configError'}
            onExpand={onExpand}
            onRemove={() => onRemove(pinnedKey(pinnedItem))}
          />
        ))}
        {transitStops.map(
          (pinnedItem) =>
            pinnedItem.kind === 'gtfs' && (
              <TransitStopCard
                key={pinnedKey(pinnedItem)}
                city={pinnedItem.city}
                stopId={pinnedItem.id}
                stopName={pinnedItem.name}
                onRemove={() => onRemove(pinnedKey(pinnedItem))}
              />
            )
        )}
      </div>
    </div>
  )
}
