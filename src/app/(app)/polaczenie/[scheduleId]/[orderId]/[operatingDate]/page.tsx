'use client'

import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation'
import { ConnectionDetails } from '@/components/ConnectionDetails'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

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
  // `train` = tymczasowy tytuł widoczny przed odpowiedzią `/api/train` —
  // zamiennik dzisiejszego propa `trainLabel` z dawnego modala.
  const trainLabel = searchParams.get('train') ?? ''

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
    <>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-8 py-7">
        {/* Nie znamy tu adresu strony-źródła — mogła to być zakładka Odjazdy
            albo Przyjazdy pełnej tablicy — więc `onBack` (router.back()), nie
            stały `backHref`. */}
        <TopBar onBack={handleBack} backLabel="Powrót do wyników" />
        <ConnectionDetails
          scheduleId={scheduleId}
          orderId={orderId}
          operatingDate={operatingDate}
          trainLabel={trainLabel}
        />
      </main>
    </>
  )
}
