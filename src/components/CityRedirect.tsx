'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCityContext } from '@/hooks/useCityContext'
import { useCities } from '@/hooks/useCities'
import { defaultCityId } from '@/lib/cityDefault'

const RESOLVING = (
  <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-16 text-sm text-text-secondary">
    Wybieram miasto…
  </main>
)

/**
 * Wspólny komponent dla `/city`, `/lines` i `/map` bez segmentu miasta — te
 * trasy różnią się tylko celem przekierowania. Dobiera miasto (ostatnie z
 * kontekstu albo to z największą liczbą stacji kolejowych) i przekierowuje na
 * `to(city)`. Nie renderuje treści na stałe.
 *
 * `useCities()` (a z nim fetch `/api/cities`) montuje się tylko w
 * `CityFromList`, czyli tylko gdy w kontekście nie ma jeszcze zapamiętanego
 * miasta — stąd rozbicie na dwa komponenty, nie jeden warunkowy hook.
 */
export function CityRedirect({ to }: { to: (city: string) => string }) {
  const router = useRouter()
  const { city, loaded } = useCityContext()

  useEffect(() => {
    if (loaded && city !== null) router.replace(to(city))
  }, [loaded, city, router, to])

  if (!loaded || city !== null) return RESOLVING
  return <CityFromList to={to} />
}

/** Porażka pobrania listy miast to odrębny stan od „brak miast" (AGENTS.md
 * #7): pierwsza pokazuje przycisk ponowienia, druga nie ma czego ponawiać. */
function CityFromList({ to }: { to: (city: string) => string }) {
  const router = useRouter()
  const { state, cities, retry } = useCities()

  useEffect(() => {
    if (state !== 'ready') return
    const top = defaultCityId(cities)
    if (top !== null) router.replace(to(top))
  }, [state, cities, router, to])

  if (state === 'failed') {
    return (
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-sm text-text-secondary">
        <p>Nie udało się wczytać listy miast.</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-secondary"
        >
          Spróbuj ponownie
        </button>
      </main>
    )
  }

  if (state === 'ready' && cities.length === 0) {
    return (
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-16 text-sm text-text-secondary">
        Brak skonfigurowanych miast.
      </main>
    )
  }

  return RESOLVING
}
