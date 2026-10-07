/**
 * Nazwa przystanku z numerem w zespole — konwencja ZTM „Centrum 02". Goła nazwa
 * („Centrum") oznacza zawsze CAŁY zespół przystanków, więc pojedynczy przystanek
 * zawsze dostaje numer. Jedyne miejsce sklejania „nazwa + numer" (AGENTS.md #13).
 * Nazwy z mocka mają już numer na końcu („Centrum 01") — nie dublujemy go; strażnik
 * patrzy na całe słowo, żeby „Linia 101" z numerem „01" wciąż go dostała.
 */
export function stopDisplayName(name: string, code: string | null): string {
  if (code === null || code === '' || name.endsWith(` ${code}`)) return name
  return `${name} ${code}`
}

/**
 * Przystanki zespołu, z których da się odjechać — bez „przystanków” bez linii (stacje-rodzice
 * metra, np. 7014M). Jedna reguła dla przełącznika przystanku i dla tagu numeru na listach.
 */
export function stopsWithLines<T extends { lines: readonly unknown[] }>(members: readonly T[] | undefined): T[] {
  return (members ?? []).filter((member) => member.lines.length > 0)
}
