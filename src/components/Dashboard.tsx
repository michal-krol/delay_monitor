'use client'

import type { ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { StationCard } from './StationCard'
import { TransitStopCard } from './TransitStopCard'
import { BoardStatus } from './BoardStatus'
import { PinnedEditor } from './PinnedEditor'
import type { StationOption } from './StationSearch'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'

type Props = {
  pinnedItems: PinnedItem[]
  onExpand: (station: StationOption) => void
  /** Odpięcie z trybu edycji (karty nie mają już gwiazdki). */
  onRemove: (key: string) => void
  /** Tryb „Edytuj ulubione": lista z ↑/↓ i odpinaniem zamiast kart. */
  editing?: boolean
  onMove?: (key: string, delta: -1 | 1) => void
  /** Przyciski Pulpitu („Dodaj", „Edytuj ulubione") w wierszu plakietki świeżości. */
  actions?: ReactNode
  /** Podmiana starego wpisu na znormalizowany (`usePinned().replacePinned`). */
  onNormalize?: (oldKey: string, next: PinnedItem) => void
}

export function Dashboard({ pinnedItems, onExpand, onRemove, onNormalize, editing = false, onMove, actions }: Props) {
  // Pulpit jest ponad miastami: stacja PKP i przystanek miejski (dowolnego
  // miasta) wiszą obok siebie na jednej siatce, w jednej kolejności użytkownika.
  // Stacje idą przez wspólny `useBoard` (jedno zapytanie), przystanki miejskie
  // mają własne karty.
  const stationIds = pinnedItems.flatMap((pinnedItem) => (pinnedItem.kind === 'pkp' ? [pinnedItem.id] : []))
  const { data, error, lastSuccessAt, refresh } = useBoard(stationIds)

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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="glass inline-flex rounded-full px-3.5 py-1.5">
          <BoardStatus fetchedAt={freshest?.fetchedAt} ageMs={freshest?.ageMs} lastSuccessAt={lastSuccessAt} data={data} error={error !== null} onRefresh={refresh} />
        </div>
        {actions}
      </div>
      {editing ? (
        <PinnedEditor pinnedItems={pinnedItems} onMove={(key, delta) => onMove?.(key, delta)} onRemove={onRemove} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-5">
          {pinnedItems.map((pinnedItem) =>
            pinnedItem.kind === 'pkp' ? (
              <StationCard
                key={pinnedKey(pinnedItem)}
                stationId={pinnedItem.id}
                stationName={pinnedItem.name}
                snapshot={snapshotsById.get(pinnedItem.id) ?? null}
                error={error !== null}
                configError={data?.status === 'configError'}
                onExpand={onExpand}
              />
            ) : (
              <TransitStopCard
                key={pinnedKey(pinnedItem)}
                city={pinnedItem.city}
                stopId={pinnedItem.id}
                stopName={pinnedItem.name}
                member={pinnedItem.member === true}
                onGroupResolved={(groupId) => onNormalize?.(pinnedKey(pinnedItem), { ...pinnedItem, id: groupId })}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
