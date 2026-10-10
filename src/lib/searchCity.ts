import { defaultCityId } from '@/lib/cityDefault'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Miasto strony `/search`: `?city=` z adresu (format zawsze, rejestr gdy lista miast już jest),
 * potem ostatnio wybrane, na końcu domyślne. `cities === null` = jeszcze się wczytuje.
 */
export function resolvePageCity(
  urlCity: string | null,
  contextCity: string | null,
  cities: { id: string; railStations: unknown[] }[] | null,
): string | null {
  if (urlCity !== null && CITY_ID_PATTERN.test(urlCity) && (cities === null || cities.some((city) => city.id === urlCity))) return urlCity
  if (contextCity !== null) return contextCity
  return cities === null ? null : defaultCityId(cities)
}
