'use client'

import { useState } from 'react'
import { notFound, useParams, useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { PageShell } from '@/components/aside'
import { TransitStopDetail } from '@/components/TransitStopDetail'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN, decodeStopIdFromPathSegment } from '@/lib/validation'

/**
 * Samodzielna trasa przystanku miejskiego — dla deep-linków i przypięć
 * z Pulpitu. Ten sam `TransitStopDetail`, którego ekran miasta osadza pod
 * wyszukiwarką (zero drugiej implementacji, AGENTS.md #2).
 */
export default function TransitStopPage() {
  const params = useParams<{ city: string; stopId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const stopId = typeof params.stopId === 'string' ? decodeStopIdFromPathSegment(params.stopId) : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_STOP_ID_PATTERN.test(stopId)) {
    notFound()
  }

  const initialName = useSearchParams().get('name') ?? undefined
  const [resolvedName, setResolvedName] = useState<string | undefined>(undefined)

  return (
    <PageShell>
      {/* „Odjazdy / Przyjazdy", nie „Trasy": ta strona wraca do `/city/{city}` —
          ← i pierwszy element ścieżki wskazują ten sam rodzic. */}
      <TopBar
        backLabel="Wróć do odjazdów"
        backHref={`/city/${city}`}
        crumbs={[{ label: 'Odjazdy / Przyjazdy', href: `/city/${city}` }, { label: resolvedName ?? initialName ?? stopId }]}
        share
      />
      <TransitStopDetail city={city} stopId={stopId} initialName={initialName} onNameResolved={setResolvedName} />
    </PageShell>
  )
}
