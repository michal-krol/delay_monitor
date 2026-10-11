import { defaultCityId } from '@/lib/cityDefault'
import { CITY_ID_PATTERN } from '@/lib/validation'

/**
 * Miasto strony `/search`: `?city=` z adresu (format i obecność w rejestrze), potem ostatnio wybrane,
 * na końcu domyślne. `cities === null` = rejestr się wczytuje: adresowi jeszcze nie ufamy (nieznane
 * `?city=zzz` wysłałoby żądania o linie nieistniejącego miasta), więc zostaje zapamiętane miasto albo `null`.
 */
export function resolvePageCity(
  urlCity: string | null,
  contextCity: string | null,
  cities: { id: string; railStations: unknown[] }[] | null,
): string | null {
  if (urlCity !== null && CITY_ID_PATTERN.test(urlCity) && cities !== null && cities.some((city) => city.id === urlCity)) return urlCity
  if (contextCity !== null) return contextCity
  return cities === null ? null : defaultCityId(cities)
}
