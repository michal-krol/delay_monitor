'use client'

import { useEffect, useState } from 'react'

/**
 * Nazwa miasta z rejestru (`/api/cities`). Fallback do samego `city` (id),
 * dopóki lista się nie wczyta — nagłówki stron linii nigdy nie migają pustką.
 */
export function useCityName(city: string): string {
  const [name, setName] = useState(city)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fallbacku przy zmianie segmentu miasta
    setName(city)
    let cancelled = false
    fetch('/api/cities')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { cities: { id: string; name: string }[] }) => {
        if (cancelled) return
        const entry = body.cities.find((option) => option.id === city)
        if (entry !== undefined) setName(entry.name)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [city])

  return name
}
