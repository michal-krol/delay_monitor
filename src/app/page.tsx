'use client'

import { useEffect, useState } from 'react'
import { useFavourites } from '@/hooks/useFavourites'
import { Dashboard } from '@/components/Dashboard'
import { FullBoard } from '@/components/FullBoard'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { EmptyState } from '@/components/EmptyState'
import { AppTitle } from '@/components/AppTitle'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { STATION_ID_PATTERN } from '@/lib/validation'

export default function Page() {
  const { favourites, loaded, addFavourite, removeFavourite, isFavourite } = useFavourites()
  const [expanded, setExpanded] = useState<StationOption | null>(null)

  // Odtworzenie rozwiniętej stacji z linku (?station=&name=) — raz, po
  // zamontowaniu. Nie w ciele komponentu: `window` nie istnieje przy SSR,
  // a czytanie go tam rozjeżdżałoby znacznik serwera z pierwszym renderem
  // klienta (ten sam powód, dla którego `useFavourites` odkłada odczyt
  // `localStorage` do efektu). Zły/uszkodzony parametr jest po prostu
  // ignorowany — link i tak trafia dalej do `/api/board`, które waliduje
  // niezależnie.
  useEffect(() => {
    const stationId = readUrlParam('station')
    const stationName = readUrlParam('name')
    if (stationId !== null && stationName !== null && STATION_ID_PATTERN.test(stationId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu (patrz komentarz nad efektem)
      setExpanded({ id: stationId, name: stationName })
    }
  }, [])

  useEffect(() => {
    patchUrlParams({
      station: expanded?.id ?? null,
      name: expanded?.name ?? null,
    })
  }, [expanded])

  if (!loaded) return null

  if (favourites.length === 0 && !expanded) {
    return (
      <main className="min-h-screen px-4 py-8">
        <EmptyState>
          <StationSearch onSelect={setExpanded} />
        </EmptyState>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <AppTitle />
          <StationSearch onSelect={setExpanded} placeholder="Dodaj stację…" />
        </div>

        {expanded ? (
          <div className="mt-6">
            <FullBoard
              stationId={expanded.id}
              stationName={expanded.name}
              isFavourite={isFavourite(expanded.id)}
              onToggleFavourite={() =>
                isFavourite(expanded.id) ? removeFavourite(expanded.id) : addFavourite(expanded)
              }
              onClose={() => setExpanded(null)}
            />
          </div>
        ) : (
          <div className="mt-6">
            <Dashboard favourites={favourites} onExpand={setExpanded} onRemove={removeFavourite} />
          </div>
        )}
      </div>
    </main>
  )
}
