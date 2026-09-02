'use client'

import { useRouter } from 'next/navigation'
import { useCityContext } from '@/hooks/useCityContext'

export type CityOption = { id: string; name: string; railStations: { id: string }[] }

/**
 * Wybór miasta w treści ekranu Odjazdy/Przyjazdy (dawniej w pasku bocznym).
 * Lista posortowana malejąco po liczbie stacji kolejowych — największy węzeł
 * pierwszy. Brak opcji „Cała Polska" — ekran jest zawsze przypisany do miasta.
 * `cities` podaje ekran (jeden wspólny fetch `/api/cities`).
 */
export function CityPicker({ cities, current }: { cities: CityOption[]; current: string }) {
  const router = useRouter()
  const { setCity } = useCityContext()

  const sorted = [...cities].sort((a, b) => b.railStations.length - a.railStations.length)
  const options = sorted.length > 0 ? sorted : [{ id: current, name: current, railStations: [] }]

  function choose(nextId: string): void {
    if (nextId === current) return
    setCity(nextId)
    router.push(`/miasto/${nextId}`)
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Miasto</span>
      <select
        value={current}
        onChange={(event) => choose(event.target.value)}
        className="glass rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
