'use client'

import { notFound, useParams, useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { TransitStopDetail } from '@/components/TransitStopDetail'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN } from '@/lib/validation'

/**
 * Samodzielna trasa przystanku miejskiego — dla deep-linków i przypięć
 * z Pulpitu. Ten sam `TransitStopDetail`, którego ekran miasta osadza pod
 * wyszukiwarką (zero drugiej implementacji, AGENTS.md #2).
 */
export default function TransitStopPage() {
  const params = useParams<{ city: string; stopId: string }>()
  const city = typeof params.city === 'string' ? params.city : ''
  const stopId = typeof params.stopId === 'string' ? params.stopId : ''

  if (!CITY_ID_PATTERN.test(city) || !GTFS_STOP_ID_PATTERN.test(stopId)) {
    notFound()
  }

  const router = useRouter()

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar backLabel="Wróć do miasta" onBack={() => router.push(`/miasto/${city}`)} />
      <TransitStopDetail city={city} stopId={stopId} />
    </main>
  )
}
