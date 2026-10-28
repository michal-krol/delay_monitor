'use client'

import { useBoard } from '@/hooks/useBoard'
import { StationCard } from './StationCard'
import { TransitStopCard } from './TransitStopCard'
import { BoardStatus } from './BoardStatus'
import { PinnedEditor } from './PinnedEditor'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'

type Props = {
  pinnedItems: PinnedItem[]
  /** Odpięcie z trybu edycji (karty nie mają już gwiazdki). */
  onRemove: (key: string) => void
  /** Tryb „Edytuj ulubione": lista z ↑/↓ i odpinaniem zamiast kart. */
  editing?: boolean
  onMove?: (key: string, delta: -1 | 1) => void
  /** Podmiana starego wpisu na znormalizowany (`usePinned().replacePinned`). */
  onNormalize?: (oldKey: string, next: PinnedItem) => void
}

export function Dashboard({ pinnedItems, onRemove, onNormalize, editing = false, onMove }: Props) {
  // Pulpit jest ponad miastami: stacja PKP i przystanek miejski (dowolnego
  // miasta) wiszą obok siebie na jednej siatce, w jednej kolejności użytkownika.
  // Stacje idą przez wspólny `useBoard` (jedno zapytanie), przystanki miejskie
  // mają własne karty.
  const stationIds = pinnedItems.flatMap((pinnedItem) => (pinnedItem.kind === 'pkp' ? [pinnedItem.id] : []))
  const { data, error, lastSuccessAt, refresh } = useBoard(stationIds)

  const received = (data?.snapshots ?? []).filter((snapshot) => snapshot !== null).filter((snapshot) => stationIds.includes(snapshot.stationId))

  // Łączenie po stationId, nie po pozycji w tablicy. Po zmianie przypiętych
  // `pinnedItems` aktualizuje się natychmiast, a `data` jeszcze przez jeden cykl
  // trzyma poprzednią odpowiedź — przy dopasowaniu po indeksie karta pokazałaby
  // wtedy nazwę jednej stacji z odjazdami innej.
  const snapshotsById = new Map(received.map((snapshot) => [snapshot.stationId, snapshot]))

  // Najstarszy otrzymany snapshot wyznacza ostrzeżenie wspólnej tablicy PKP.
  const oldest = received.reduce<(typeof received)[number] | undefined>(
    (best, snapshot) => (best === undefined || snapshot.fetchedAt < best.fetchedAt ? snapshot : best),
    undefined
  )

  return (
    <div>
      {stationIds.length > 0 && (
        <BoardStatus headerData="warnings" fetchedAt={oldest?.fetchedAt} ageMs={oldest?.ageMs} lastSuccessAt={lastSuccessAt} data={data} error={error !== null} onRefresh={refresh} sources={pinnedItems.flatMap((item) => item.kind === 'pkp' ? [{ id: `pkp:${item.id}`, label: `PKP — ${item.name}`, updatedAt: snapshotsById.get(item.id)?.fetchedAt ?? null, ageMs: snapshotsById.get(item.id)?.ageMs, error: error !== null, refresh }] : [])} />
      )}
      {editing ? (
        <PinnedEditor pinnedItems={pinnedItems} onMove={(key, delta) => onMove?.(key, delta)} onRemove={onRemove} />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4">
          {pinnedItems.map((pinnedItem) =>
            pinnedItem.kind === 'pkp' ? (
              <StationCard
                key={pinnedKey(pinnedItem)}
                stationId={pinnedItem.id}
                stationName={pinnedItem.name}
                snapshot={snapshotsById.get(pinnedItem.id) ?? null}
                error={error !== null}
                configError={data?.status === 'configError'}
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
