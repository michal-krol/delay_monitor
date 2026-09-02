'use client'

import { useEffect, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { RailStationList } from '@/components/RailStationList'
import { TransitStopList } from '@/components/TransitStopList'
import { useCityContext } from '@/hooks/useCityContext'
import { CITY_ID_PATTERN } from '@/lib/validation'

type CityInfo = { id: string; name: string; hasTransit: boolean; railStations: { id: string; name: string }[] }

export default function CityPage() {
  const params = useParams<{ city: string }>()
  const city = typeof params.city === 'string' ? params.city : ''

  if (!CITY_ID_PATTERN.test(city)) {
    notFound()
  }

  const { setCity } = useCityContext()
  const [info, setInfo] = useState<CityInfo | null | 'missing'>(null)

  // Wejście na ekran miasta ustawia kontekst — przełącznik w menu to odzwierciedla.
  useEffect(() => {
    setCity(city)
  }, [city, setCity])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityInfo[] }) => {
        if (cancelled) return
        setInfo(body.cities.find((entry) => entry.id === city) ?? 'missing')
      })
      .catch(() => {
        if (!cancelled) setInfo('missing')
      })
    return () => {
      cancelled = true
    }
  }, [city])

  const cityName = info !== null && info !== 'missing' ? info.name : city

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 sm:px-8 sm:py-7">
      <TopBar title={cityName} subtitle="Stacje kolejowe i przystanki komunikacji miejskiej" />

      {/* Dwie kolumny, dwa różne słowniki, zero mieszania. Strona kolejowa ma
          opóźnienia i je pokazuje; strona miejska mówi „rozkład", nigdy „na
          czas" — niezmiennik #7 wyrażony w układzie ekranu. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-lg font-bold text-foreground">Stacje kolejowe</h2>
          <RailStationList stations={info !== null && info !== 'missing' ? info.railStations : []} />
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-bold text-foreground">Przystanki miejskie</h2>
          <TransitStopList city={city} />
        </section>
      </div>
    </main>
  )
}
