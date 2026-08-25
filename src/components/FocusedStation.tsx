'use client'

import { useState } from 'react'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardRowList } from './BoardRowList'
import { PillButton, TabButton, type Direction } from './FullBoard'
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
  // Ta sama zakładka Odjazdy/Przyjazdy co FullBoard — dwa ekrany tej samej
  // stacji mają wyglądać spójnie, nie jak dwie osobne implementacje.
  const [direction, setDirection] = useState<Direction>('departures')

  // Ten sam filtr "tylko nadchodzące" co StationCard, ale z nieco luźniejszym
  // cięciem (5 zamiast 3) — tryb ogniskowy ma więcej miejsca na ekranie.
  const rows = (snapshot?.[direction].filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, MAX_ROWS)

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
        <>
          <div role="tablist" aria-label="Kierunek" className="mt-4 inline-flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5">
            <TabButton active={direction === 'departures'} onClick={() => setDirection('departures')}>
              Odjazdy
            </TabButton>
            <TabButton active={direction === 'arrivals'} onClick={() => setDirection('arrivals')}>
              Przyjazdy
            </TabButton>
          </div>

          <BoardRowList
            rows={rows}
            loading={!snapshot && !error}
            showEmpty={snapshot !== null && rows.length === 0}
            emptyMessage={direction === 'departures' ? 'Brak odjazdów w najbliższych godzinach' : 'Brak przyjazdów w najbliższych godzinach'}
          />
        </>
      )}
    </section>
  )
}
