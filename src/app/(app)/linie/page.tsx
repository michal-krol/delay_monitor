'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCityContext } from '@/hooks/useCityContext'

type CityOption = { id: string; railStations: { id: string }[] }

/**
 * `/linie` bez segmentu — menu „Trasy" tu prowadzi. Dobiera miasto (jak
 * `/miasto`) i przekierowuje na `/miasto/[city]/linie`. Nie renderuje treści.
 */
export default function LinieIndex() {
  const router = useRouter()
  const { city, loaded } = useCityContext()
  const [status, setStatus] = useState<'resolving' | 'empty'>('resolving')

  useEffect(() => {
    if (!loaded) return
    if (city !== null) {
      router.replace(`/miasto/${city}/linie`)
      return
    }
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityOption[] }) => {
        if (cancelled) return
        const top = [...body.cities].sort((a, b) => b.railStations.length - a.railStations.length)[0]
        if (top === undefined) {
          setStatus('empty')
          return
        }
        router.replace(`/miasto/${top.id}/linie`)
      })
      .catch(() => {
        if (!cancelled) setStatus('empty')
      })
    return () => {
      cancelled = true
    }
  }, [loaded, city, router])

  return (
    <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-16 text-sm text-text-secondary">
      {status === 'empty' ? 'Brak skonfigurowanych miast.' : 'Wybieram miasto…'}
    </main>
  )
}
