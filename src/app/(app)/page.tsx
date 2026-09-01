'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFavourites } from '@/hooks/useFavourites'
import { Dashboard } from '@/components/Dashboard'
import { EmptyState } from '@/components/EmptyState'
import { StationSearch, type StationOption } from '@/components/StationSearch'
import { TopBar } from '@/components/TopBar'
import { NetworkStatsCard } from '@/components/NetworkStatsCard'
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

  /**
   * `?focus=` to stary adres rozwiniętej stacji na pulpicie. Widok stacji jest
   * teraz jeden — pełna strona `/odjazdy/{id}` z kafelkami KPI i prawą kolumną
   * — więc stare linki przekierowujemy, zamiast utrzymywać drugi, uboższy
   * widok tej samej rzeczy (to właśnie ten rodzaj rozjazdu, o którym mówi
   * AGENTS.md #2).
   *
   * `replace`, nie `push`: przekierowanie nie ma zostawiać wpisu w historii,
   * bo „wstecz" wracałoby na adres, który natychmiast przekierowuje ponownie.
   */
  useEffect(() => {
    if (focusedStationId === null || !loaded) return
    const name = favourites.find((favourite) => favourite.id === focusedStationId)?.name
    const query = name === undefined ? '' : `?name=${encodeURIComponent(name)}`
    router.replace(`/odjazdy/${focusedStationId}${query}`)
  }, [focusedStationId, loaded, favourites, router])

  if (!loaded) return null
  // Przekierowanie leci w efekcie wyżej; przez tę jedną klatkę nie ma po co
  // pokazywać pulpitu, który zaraz zniknie.
  if (focusedStationId !== null) return null

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 sm:px-8 sm:py-7">
        <TopBar title="Pulpit" subtitle="Twoje ulubione stacje i najbliższe odjazdy" />
        <StationSearch onSelect={goToBoard} placeholder="Dodaj stację…" />

        {favourites.length === 0 ? (
          <EmptyState />
        ) : (
          <Dashboard favourites={favourites} onExpand={goToBoard} onRemove={removeFavourite} />
        )}
      </main>
      {/* Tylko Pulpit -- pozostałe strony (/odjazdy, /polaczenie) celowo bez
          trzeciej kolumny, patrz plan (Faza 3). Schowany poniżej xl, żeby nie
          ściskać tablicy na węższych ekranach. */}
      <aside className="hidden w-72 shrink-0 self-start sticky top-0 max-h-dvh overflow-y-auto py-7 pr-8 xl:block">
        <NetworkStatsCard />
      </aside>
    </>
  )
}
