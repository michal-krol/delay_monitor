import type { GtfsMode } from '@/lib/gtfs/types'
import { MODE_ORDER } from './transitMode'

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

/**
 * Rodzaje miejsca na karcie/liście: zespół = rodzaje zespołu (jak podał serwer); pojedynczy przystanek =
 * rodzaje jego linii, bo zespół „Centrum” może łączyć tramwaj i autobus. Przystanku nie ma na liście albo nie
 * ma linii → rodzaje zespołu; brak tablicy → `[]` (nieznane, nigdy domyślny autobus).
 */
export function stopModes(
  board: { modes: GtfsMode[]; members?: readonly { id: string; lines: readonly { mode: GtfsMode }[] }[] } | null,
  memberId: string | null
): GtfsMode[] {
  if (board === null) return []
  const lines = memberId === null ? [] : (board.members?.find((member) => member.id === memberId)?.lines ?? [])
  if (lines.length === 0) return board.modes
  const modes = new Set(lines.map((line) => line.mode))
  return MODE_ORDER.filter((mode) => modes.has(mode))
}
