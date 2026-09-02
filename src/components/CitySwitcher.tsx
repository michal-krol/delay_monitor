'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCityContext } from '@/hooks/useCityContext'

type CityOption = { id: string; name: string; hasTransit: boolean }

/**
 * Przełącznik kontekstu nad menu bocznym. Domyślny kontekst to
 * „Cała Polska — kolej" — dokładnie dzisiejsze zachowanie aplikacji, nic się
 * nie psuje dla obecnych użytkowników. Wybranie miasta prowadzi na jego ekran
 * (`/miasto/[city]`), gdzie oba światy są zawężone do tego miasta.
 */
export function CitySwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const { city, setCity } = useCityContext()
  const [cities, setCities] = useState<CityOption[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: CityOption[] }) => {
        if (!cancelled) setCities(body.cities.filter((option) => option.hasTransit))
      })
      .catch(() => {
        // Brak listy miast → zostaje sam kontekst krajowy; przełącznik nadal działa.
      })
    return () => {
      cancelled = true
    }
  }, [])

  function choose(nextId: string): void {
    const next = nextId === '' ? null : nextId
    setCity(next)
    router.push(next === null ? '/' : `/miasto/${next}`)
  }

  if (collapsed) return null

  return (
    <label className="flex flex-col gap-1 px-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Kontekst</span>
      <select
        value={city ?? ''}
        onChange={(event) => choose(event.target.value)}
        className="glass w-full rounded-lg px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">Cała Polska — kolej</option>
        {cities.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
