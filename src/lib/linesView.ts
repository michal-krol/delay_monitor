import { rankLines } from '@/lib/discovery'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'

/** Tyle znaków ma pole wyszukiwania; dłuższe `?q=` z adresu ucinamy tak samo (jak w `/search`). */
export const MAX_LINES_QUERY = 100

export type LinesView = { q: string }

/** Widok katalogu linii z adresu (#4): wycofany `mode` jest ignorowany, `q` jest przycięte. */
export function parseLinesView(params: URLSearchParams): LinesView {
  return { q: (params.get('q') ?? '').slice(0, MAX_LINES_QUERY) }
}

/** Łatka dla `patchUrlParams`: pusta fraza i brak trybu usuwają parametr, reszta zapytania zostaje. */
export function linesViewPatch({ q }: LinesView): Record<string, string | null> {
  return { q: q === '' ? null : q, mode: null }
}

/**
 * Lista widoczna w katalogu: (przy niepustej frazie) wspólny ranking z wyszukiwarki
 * (`rankLines`: numer równy → prefiks numeru → fraza w nazwie trasy), bez limitu 8 — to pełna lista wyników.
 * Fraza z samych spacji = brak frazy.
 */
export function filterCatalogLines(lines: LineListEntry[], { q }: LinesView): LineListEntry[] {
  return q.trim() === '' ? lines : rankLines(lines, q, lines.length)
}

/** Płaska lista → `Record<GtfsMode, …>` dla `LineGrid` (wszystkie pięć kluczy, kolejność wejścia w obrębie trybu). */
export function groupByMode(lines: LineListEntry[]): Record<GtfsMode, LineListEntry[]> {
  const grouped: Record<GtfsMode, LineListEntry[]> = { metro: [], tram: [], bus: [], rail: [], other: [] }
  for (const entry of lines) grouped[entry.mode].push(entry)
  return grouped
}
