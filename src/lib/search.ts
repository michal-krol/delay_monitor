/**
 * Normalizacja tekstu do porównań w wyszukiwarce stacji.
 *
 * Sprowadza do małych liter i zdejmuje znaki diakrytyczne, żeby „Wroclaw"
 * znajdowało „Wrocław", a „gdansk" — „Gdańsk".
 *
 * NFD rozkłada większość polskich liter na literę bazową plus znak łączący
 * (ą → a + ogonek), ale „ł" i „Ł" to samodzielne znaki (U+0142 / U+0141),
 * których żadna normalizacja Unicode nie rozłoży — stąd osobne podstawienie.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim()
}

/** Czy `name` zawiera `query`, ignorując wielkość liter i diakrytykę. */
export function matchesStationName(name: string, normalizedQuery: string): boolean {
  return normalizeForSearch(name).includes(normalizedQuery)
}
