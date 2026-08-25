'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFavourites } from '@/hooks/useFavourites'
import { Dashboard } from '@/components/Dashboard'
import { EmptyState } from '@/components/EmptyState'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { STATION_ID_PATTERN } from '@/lib/validation'

// `/` nie ma dynamicznego segmentu, więc build próbuje ją prerenderować
// statycznie -- useSearchParams() wymaga wtedy granicy <Suspense> (inaczej
// błąd "missing-suspense-with-csr-bailout"), inaczej niż na /odjazdy/[stationId],
// gdzie sam dynamiczny segment już wyklucza prerender. Fallback `null` to
// dokładnie to, co strona i tak pokazywała wcześniej przez `!loaded`.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PulpitPage />
    </Suspense>
  )
}

function PulpitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { favourites, loaded, removeFavourite } = useFavourites()

  const rawFocus = searchParams.get('focus')
  const focusedStationId = rawFocus && STATION_ID_PATTERN.test(rawFocus) ? rawFocus : null

  function goToBoard(station: StationOption): void {
    router.push(`/odjazdy/${station.id}?name=${encodeURIComponent(station.name)}`)
  }

  function setFocus(station: StationOption): void {
    router.push(`/?focus=${station.id}`)
  }

  function clearFocus(): void {
    router.push('/')
  }

  if (!loaded) return null

  return (
    <>
      <Sidebar activeItem="pulpit" />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-7">
        <TopBar title="Pulpit" subtitle="Twoje ulubione stacje i najbliższe odjazdy" />
        <StationSearch onSelect={goToBoard} placeholder="Dodaj stację…" />

        {favourites.length === 0 ? (
          <EmptyState />
        ) : (
          <Dashboard
            favourites={favourites}
            onExpand={setFocus}
            onRemove={removeFavourite}
            focusedStationId={focusedStationId}
            onSeeAll={goToBoard}
            onCloseFocus={clearFocus}
          />
        )}
      </main>
    </>
  )
}
