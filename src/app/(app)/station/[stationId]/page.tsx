'use client'

import { notFound, useParams, useSearchParams } from 'next/navigation'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { TopBar } from '@/components/TopBar'
import { PageShell } from '@/components/aside'
import { FullBoard } from '@/components/FullBoard'
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

  const searchParams = useSearchParams()
  const { isPinned, addPinned, removePinned } = usePinned()
  const stationName = searchParams.get('name') ?? stationId

  const pinnedItem: PinnedItem = { kind: 'pkp', id: stationId, name: stationName }
  const key = pinnedKey(pinnedItem)

  return (
    <PageShell>
      {/* Jedyna droga tutaj to wyszukiwarka na Starcie (`goToBoard`) i stary
          `?focus=` (też ze Startu) — rodzic jednoznaczny, w przeciwieństwie
          do `/connection/...`, więc ← to link. */}
      <TopBar backLabel="Wróć do Startu" backHref="/" crumbs={[{ label: 'Start', href: '/' }, { label: stationName }]} share hideOnPhone />
      <FullBoard
        stationId={stationId}
        stationName={stationName}
        phoneBack={{ href: '/', label: 'Wróć do Startu' }}
        isPinned={isPinned(key)}
        onTogglePin={() => (isPinned(key) ? removePinned(key) : addPinned(pinnedItem))}
      />
    </PageShell>
  )
}
