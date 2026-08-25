'use client'

import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardRowList } from './BoardRowList'
import { PillButton } from './FullBoard'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'

type Props = {
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
  onSeeAll: () => void
  onClose: () => void
}

const MAX_ROWS = 5

export function FocusedStation({ stationName, snapshot, error, configError, onSeeAll, onClose }: Props) {
  const now = useSnapshotNow(snapshot)

  // Ten sam filtr "tylko nadchodzące" co StationCard, ale z nieco luźniejszym
  // cięciem (5 zamiast 3) — tryb ogniskowy ma więcej miejsca na ekranie.
  const departures = (snapshot?.departures.filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, MAX_ROWS)
  const arrivals = (snapshot?.arrivals.filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, MAX_ROWS)

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{stationName}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <PillButton onClick={onSeeAll}>Zobacz wszystkie</PillButton>
          <PillButton onClick={onClose}>Zamknij</PillButton>
        </div>
      </div>

      {error && (
        <p aria-live="polite" className="mt-1 text-xs text-red-600 dark:text-red-400">
          Błąd pobierania danych
        </p>
      )}

      {configError ? (
        <div className="mt-4">
          <ConfigErrorBanner />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-text-muted">Odjazdy</h3>
            <BoardRowList
              rows={departures}
              loading={!snapshot && !error}
              showEmpty={snapshot !== null && departures.length === 0}
              emptyMessage="Brak odjazdów w najbliższych godzinach"
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-muted">Przyjazdy</h3>
            <BoardRowList
              rows={arrivals}
              loading={!snapshot && !error}
              showEmpty={snapshot !== null && arrivals.length === 0}
              emptyMessage="Brak przyjazdów w najbliższych godzinach"
            />
          </div>
        </div>
      )}
    </section>
  )
}
