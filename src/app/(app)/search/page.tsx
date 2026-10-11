'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CityPicker } from '@/components/CityPicker'
import { TopBar } from '@/components/TopBar'
import { UnifiedSearch } from '@/components/UnifiedSearch'
import { PageShell } from '@/components/aside'
import { useCities } from '@/hooks/useCities'
import { useCityContext } from '@/hooks/useCityContext'
import { discoveryHref, type DiscoveryResult } from '@/lib/discovery'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'
import { resolvePageCity } from '@/lib/searchCity'
import { patchUrlParams } from '@/lib/urlState'

/** Tyle znaków ma pole (`maxLength` w `UnifiedSearch`); dłuższe `?q=` z adresu ucinamy tak samo. */
const MAX_QUERY = 100

const SUBTITLE = 'Stacje, przystanki i linie'

// `useSearchParams()` wymaga granicy <Suspense> przy prerenderze statycznym (jak w `(app)/page.tsx`);
// fallback trafia do HTML-a, więc to ten sam szkielet co po hydracji — nie pusty ekran (#7).
export default function Page() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchPage />
    </Suspense>
  )
}

function SearchSkeleton() {
  return (
    <PageShell>
      <TopBar title="Szukaj" subtitle={SUBTITLE} />
      <div aria-busy="true" data-testid="search-skeleton" className="w-full max-w-2xl">
        <span className="sr-only">Wczytywanie…</span>
        <div aria-hidden="true" className="h-11 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
      </div>
    </PageShell>
  )
}

function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { state, cities } = useCities()
  const { city: contextCity } = useCityContext()

  // Bez przycinania białych znaków: pole odbija to, co wpisano (echo `onQueryChange`), a `?q=` ma ≤ 100 znaków.
  const query = (searchParams.get('q') ?? '').slice(0, MAX_QUERY)
  const registry = state === 'ready' ? cities : null
  const city = resolvePageCity(searchParams.get('city'), contextCity, registry)

  function select(result: DiscoveryResult): void {
    const href = discoveryHref(result)
    if (href === null) return
    router.push(href, NAV_FORWARD_OPTIONS)
  }

  const picker =
    city !== null && registry !== null ? (
      <CityPicker
        cities={registry}
        current={city}
        replace
        compact
        hrefFor={(id) => `/search?city=${encodeURIComponent(id)}${query === '' ? '' : `&q=${encodeURIComponent(query)}`}`}
      />
    ) : undefined

  return (
    <PageShell>
      <TopBar title="Szukaj" subtitle={SUBTITLE} actions={picker} />
      <div className="w-full max-w-2xl">
        {/* Fraza idzie do adresu przez replaceState — bez wpisu historii na literę; Wstecz wraca na poprzednią stronę. */}
        <UnifiedSearch autoFocus city={city} initialQuery={query} onQueryChange={(next) => patchUrlParams({ q: next === '' ? null : next })} onSelect={select} />
      </div>
    </PageShell>
  )
}
