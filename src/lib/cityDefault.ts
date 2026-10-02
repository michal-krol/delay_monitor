/**
 * Domyślne miasto, gdy użytkownik nie wybrał żadnego: to z największą liczbą stacji kolejowych
 * (remis → pierwsze z listy). Jedna reguła dla `CityRedirect` i okna wyszukiwania.
 */
export function defaultCityId(cities: { id: string; railStations: unknown[] }[]): string | null {
  let top: { id: string; railStations: unknown[] } | undefined
  for (const city of cities) {
    if (top === undefined || city.railStations.length > top.railStations.length) top = city
  }
  return top?.id ?? null
}
