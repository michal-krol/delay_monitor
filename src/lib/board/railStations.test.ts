import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CityFeed } from '@/lib/gtfs/cities'

const searchStations = vi.fn(async (query: string) =>
  query === 'Warszawa' ? [{ id: '33605', name: 'Warszawa Centralna' }, { id: '80416', name: 'Kraków Główny' }] : []
)

vi.mock('./instance', () => ({
  client: { searchStations: (...args: [string]) => searchStations(...args) },
}))

const CITY: CityFeed = {
  id: 'warszawa',
  name: 'Warszawa',
  staticUrl: 'https://example.invalid/gtfs.zip',
  vehiclesUrl: null,
  alertsUrl: null,
  railStationPrefix: 'Warszawa ',
  timezone: 'Europe/Warsaw',
  mapCenter: { lat: 52.23, lon: 21.01 },
}

// `vi.resetModules()` przed każdym testem: `resolveCityRailStations` trzyma
// cache jako singleton modułu, więc bez tego drugi test dziedziczyłby wpis
// zapisany przez pierwszy (ten sam wzorzec co w `rail-stations/route.test.ts`
// i `cities/route.test.ts`, zmienionych razem z tym plikiem -- patrz tam).
beforeEach(() => {
  vi.resetModules()
  searchStations.mockClear()
})

describe('resolveCityRailStations', () => {
  it("cache'uje udany wynik -- drugie wywołanie w oknie TTL nie woła searchStations ponownie", async () => {
    const { resolveCityRailStations } = await import('./railStations')
    const first = await resolveCityRailStations(CITY)
    const second = await resolveCityRailStations(CITY)

    expect(first).toEqual([{ id: '33605', name: 'Warszawa Centralna' }])
    expect(second).toEqual(first)
    expect(searchStations).toHaveBeenCalledTimes(1)
  })

  // Sedno naprawy: awaria wyszukania też ma trafić do cache'u, nie tylko
  // ścieżka sukcesu -- inaczej sustained awaria słownika stacji PKP
  // powtarzałaby próbę przy KAŻDYM pollu (co 90 s) zamiast raz na TTL.
  // Wartością negatywną jest `null` (nieznane), NIE `[]` (zero stacji) --
  // AGENTS.md #7, „nie udało się sprawdzić" ≠ „brak wyników".
  it("cache'uje też PORAŻKĘ wyszukania jako null (nieznane, nie [] -- AGENTS.md #7)", async () => {
    searchStations.mockRejectedValueOnce(new Error('słownik stacji niedostępny'))
    const { resolveCityRailStations } = await import('./railStations')

    const first = await resolveCityRailStations(CITY)
    expect(first).toBeNull()

    const second = await resolveCityRailStations(CITY)
    expect(second).toBeNull()
    // Druga wartość wciąż z cache'u -- searchStations wywołane tylko raz (ta awaria).
    expect(searchStations).toHaveBeenCalledTimes(1)
  })

  it('deduplikuje równoległe wywołania dla tego samego miasta -- jedno searchStations w locie', async () => {
    const { resolveCityRailStations } = await import('./railStations')
    const [a, b] = await Promise.all([resolveCityRailStations(CITY), resolveCityRailStations(CITY)])

    expect(a).toEqual(b)
    expect(searchStations).toHaveBeenCalledTimes(1)
  })
})
