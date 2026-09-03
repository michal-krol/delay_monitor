/**
 * Rejestr miast — JEDYNE miejsce w warstwie GTFS, które wie o Warszawie.
 * Dodanie kolejnego miasta to jeden wpis w tej tablicy, zero nowego kodu
 * (test odbioru: `cities.test.ts`). Słowa „wtp" ani „warszawa" nie ma nigdzie
 * poza wartościami tutaj i w fixture'ach.
 */
export type CityFeed = {
  /**
   * Slug miasta — pełna nazwa bez polskich znaków (`warszawa`, `krakow`), nie
   * trzyliterowy kod. Segment trasy `/miasto/[city]`, prefiks przestrzeni
   * identyfikatorów, klucz do tego rejestru. `[a-z]{2,24}`, walidowany u wejścia.
   */
  id: string
  /** np. `Warszawa` — do nagłówków UI. */
  name: string
  /** Statyczny feed GTFS (ZIP). */
  staticUrl: string
  /** Pozycje pojazdów (etap 5) — `null`, gdy miasto ich nie publikuje. */
  vehiclesUrl: string | null
  /** Alerty (etap 5). */
  alertsUrl: string | null
  /**
   * Prefiks nazw stacji PKP należących do tego miasta („Warszawa "). Bez
   * geometrii, bez parowania stacji z przystankami — to krucha heurystyka,
   * a produkt jej nie potrzebuje (decyzja użytkownika). Pole w `CityFeed`,
   * więc zmiana reguły dla konkretnego miasta nie dotyka kodu.
   */
  railStationPrefix: string
  /** Strefa czasu miasta — `serviceDayNoonEpoch()` bierze ją stąd. */
  timezone: string
}

const REGISTRY: readonly CityFeed[] = [
  {
    id: 'warszawa',
    name: 'Warszawa',
    staticUrl: 'https://mkuran.pl/gtfs/warsaw/gtfs.user_facing.zip',
    vehiclesUrl: 'https://mkuran.pl/gtfs/warsaw/vehicles.json',
    alertsUrl: 'https://mkuran.pl/gtfs/warsaw/alerts.json',
    railStationPrefix: 'Warszawa ',
    timezone: 'Europe/Warsaw',
  },
]

const BY_ID = new Map(REGISTRY.map((city) => [city.id, city]))

export function getCity(id: string): CityFeed | null {
  return BY_ID.get(id) ?? null
}

export function allCities(): readonly CityFeed[] {
  return REGISTRY
}
