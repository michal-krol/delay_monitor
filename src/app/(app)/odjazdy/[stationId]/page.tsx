'use client'

import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { useFavourites } from '@/hooks/useFavourites'
import { FullBoard } from '@/components/FullBoard'
import { Sidebar } from '@/components/Sidebar'
import { STATION_ID_PATTERN } from '@/lib/validation'

/**
 * Segment dynamiczny czytany przez `useParams()`, nie przez prop `params`.
 * W Next.js 16 `params`/`searchParams` przekazywane jako propsy strony są
 * `Promise`-ami (potwierdzone w node_modules/next/dist/docs/01-app/03-api-
 * reference/03-file-conventions/page.md dla zainstalowanej wersji 16.2.12) —
 * ich rozpakowanie w komponencie klienckim wymagałoby `React.use()`, co
 * zawiesza render do najbliższego Suspense przy pierwszym wywołaniu (Next nie
 * preinicjalizuje `.status`/`.value` na tej obietnicy dla klienta — patrz
 * `createParamsFromClient`/`makeUntrackedParams` w node_modules/next/dist/
 * server/request/params.js). To niepotrzebnie komplikowałoby dokładnie to, co
 * ma być proste: `notFound()` wywołane synchronicznie, przed jakimkolwiek
 * hookiem/fetchem. `useParams()`/`useSearchParams()` czytają te same wartości
 * synchronicznie z routera po stronie klienta — bez Promise, bez Suspense.
 */
export default function Page() {
  const params = useParams<{ stationId: string }>()
  const stationId = typeof params.stationId === 'string' ? params.stationId : ''

  if (!STATION_ID_PATTERN.test(stationId)) {
    notFound()
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()
  const stationName = searchParams.get('name') ?? stationId

  return (
    <>
      <Sidebar activeItem="odjazdy" />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-7">
        <FullBoard
          stationId={stationId}
          stationName={stationName}
          isFavourite={isFavourite(stationId)}
          onToggleFavourite={() =>
            isFavourite(stationId) ? removeFavourite(stationId) : addFavourite({ id: stationId, name: stationName })
          }
          onClose={() => router.push('/')}
        />
      </main>
    </>
  )
}
