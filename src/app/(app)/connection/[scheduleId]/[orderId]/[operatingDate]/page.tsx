'use client'

import { useState } from 'react'
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { ConnectionDetails } from '@/components/ConnectionDetails'
import { TopBar } from '@/components/TopBar'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageShell } from '@/components/aside'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'
import { useShareUrl } from '@/hooks/useShareUrl'

/**
 * Segmenty dynamiczne czytane przez `useParams()`, nie przez prop `params`.
 * Ten sam wzorzec i uzasadnienie co w `odjazdy/[stationId]/page.tsx` (Task
 * 2.1): w Next.js 16.2.12 `params`/`searchParams` przekazywane jako propsy
 * strony są `Promise`-ami, ale to komponent kliencki (`'use client'`, bo
 * strona jest interaktywna — przycisk powrotu, fetch szczegółów połączenia),
 * więc `React.use(params)` zawiesiłby render do najbliższego Suspense przy
 * pierwszym wywołaniu zamiast pozwolić na synchroniczne `notFound()` PRZED
 * jakimkolwiek hookiem/fetchem. `useParams()`/`useSearchParams()` czytają te
 * same wartości synchronicznie z routera po stronie klienta — bez Promise.
 *
 * `scheduleId`/`orderId` używają `STATION_ID_PATTERN` — te same "gołe cyfry"
 * co identyfikator stacji (patrz `src/lib/validation.ts`), nie osobny wzorzec.
 */
export default function Page() {
  const params = useParams<{ scheduleId: string; orderId: string; operatingDate: string }>()
  const scheduleId = typeof params.scheduleId === 'string' ? params.scheduleId : ''
  const orderId = typeof params.orderId === 'string' ? params.orderId : ''
  const operatingDate = typeof params.operatingDate === 'string' ? params.operatingDate : ''

  if (
    !STATION_ID_PATTERN.test(scheduleId) ||
    !STATION_ID_PATTERN.test(orderId) ||
    !OPERATING_DATE_PATTERN.test(operatingDate)
  ) {
    notFound()
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const { share } = useShareUrl()
  // `train` = tymczasowy tytuł widoczny przed odpowiedzią `/api/train` —
  // zamiennik dzisiejszego propa `trainLabel` z dawnego modala.
  const trainLabel = searchParams.get('train') ?? ''
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)

  // `router.back()` bez wcześniejszej historii w tej karcie (wejście przez
  // wklejony/otwarty w nowej karcie link) zostawia użytkownika poza aplikacją
  // zamiast na niej — sprawdzone ręcznie. Navigation API (`window.navigation`)
  // wie, czy jest dokąd wrócić; tam gdzie API niedostępne (np. starszy Safari)
  // po prostu próbujemy `back()` jak dotąd — ta sama, nieco gorsza sytuacja co
  // przed tym dodatkiem, nie regresja.
  function handleBack(): void {
    const navigationApi = (window as unknown as { navigation?: { canGoBack: boolean } }).navigation
    if (navigationApi !== undefined && !navigationApi.canGoBack) {
      router.push('/')
      return
    }
    router.back()
  }

  return (
    <PageShell>
      {/* Pierwszy segment bez `href`, nie zgadujemy: nie znamy tu adresu
          strony-źródła (mogła to być zakładka Odjazdy albo Przyjazdy pełnej
          tablicy, PKP albo GTFS) — ten sam powód co `onBack` niżej zamiast
          stałego `backHref`. `Breadcrumb` renderuje element bez `href` jako
          zwykły tekst, nie link donikąd. */}
      <Breadcrumb items={[{ label: 'Tablica odjazdów' }, { label: resolvedLabel ?? (trainLabel || 'Połączenie') }]} />
      {/* Nie znamy tu adresu strony-źródła — mogła to być zakładka Odjazdy
          albo Przyjazdy pełnej tablicy — więc `onBack` (router.back()), nie
          stały `backHref`. */}
      <TopBar onBack={handleBack} backLabel="Powrót do wyników" onShare={() => void share()} />
      <ConnectionDetails
        scheduleId={scheduleId}
        orderId={orderId}
        operatingDate={operatingDate}
        trainLabel={trainLabel}
        onLabelResolved={setResolvedLabel}
      />
    </PageShell>
  )
}
