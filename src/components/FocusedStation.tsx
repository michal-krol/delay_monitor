'use client'

import { useState } from 'react'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardTable } from './BoardTable'
import { IconButton, TabButton, type Direction } from './FullBoard'
import { CloseIcon } from './icons'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'

type Props = {
  stationName: string
  snapshot: BoardApiSnapshot | null
  configError: boolean
  onClose: () => void
}

export function FocusedStation({ stationName, snapshot, configError, onClose }: Props) {
  const now = useSnapshotNow(snapshot)
  // Ta sama zakładka Odjazdy/Przyjazdy co FullBoard — dwa ekrany tej samej
  // stacji mają wyglądać spójnie, nie jak dwie osobne implementacje.
  const [direction, setDirection] = useState<Direction>('departures')

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{stationName}</h2>
        <IconButton onClick={onClose} label="Zamknij">
          <CloseIcon size={15} />
        </IconButton>
      </div>

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

          <BoardTable stationName={stationName} direction={direction} rows={snapshot?.[direction] ?? []} now={now} loading={snapshot === null} />
        </>
      )}
    </section>
  )
}
