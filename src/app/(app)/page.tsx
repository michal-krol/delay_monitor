'use client'

import { useRouter } from 'next/navigation'
import { useFavourites } from '@/hooks/useFavourites'
import { Dashboard } from '@/components/Dashboard'
import { EmptyState } from '@/components/EmptyState'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'

export default function Page() {
  const router = useRouter()
  const { favourites, loaded, removeFavourite } = useFavourites()

  function goToBoard(station: StationOption): void {
    router.push(`/odjazdy/${station.id}?name=${encodeURIComponent(station.name)}`)
  }

  if (!loaded) return null

  return (
    <>
      <Sidebar activeItem="pulpit" />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-7">
        <TopBar title="Pulpit" subtitle="Twoje ulubione stacje i najbliższe odjazdy" />

        {favourites.length === 0 ? (
          <EmptyState>
            <StationSearch onSelect={goToBoard} />
          </EmptyState>
        ) : (
          <Dashboard favourites={favourites} onExpand={goToBoard} onRemove={removeFavourite} />
        )}
      </main>
    </>
  )
}
