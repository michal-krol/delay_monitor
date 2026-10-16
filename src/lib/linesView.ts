import { MODE_ORDER } from '@/components/transitMode'
import { rankLines } from '@/lib/discovery'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'

/** Tyle znaków ma pole wyszukiwania; dłuższe `?q=` z adresu ucinamy tak samo (jak w `/search`). */
export const MAX_LINES_QUERY = 100

export type LinesView = { q: string; mode: GtfsMode | null }

const isGtfsMode = (value: string | null): value is GtfsMode => value !== null && (MODE_ORDER as string[]).includes(value)

/** Widok katalogu linii z adresu (#4): zły `mode` odpada po cichu, `q` jest przycięte. */
export function parseLinesView(params: URLSearchParams): LinesView {
  const mode = params.get('mode')
  return { q: (params.get('q') ?? '').slice(0, MAX_LINES_QUERY), mode: isGtfsMode(mode) ? mode : null }
}

/** Łatka dla `patchUrlParams`: pusta fraza i brak trybu usuwają parametr, reszta zapytania zostaje. */
export function linesViewPatch({ q, mode }: LinesView): Record<string, string | null> {
  return { q: q === '' ? null : q, mode }
}

/**
 * Lista widoczna w katalogu: najpierw filtr trybu, potem (przy niepustej frazie) wspólny ranking z wyszukiwarki
 * (`rankLines`: numer równy → prefiks numeru → fraza w nazwie trasy), bez limitu 8 — to pełna lista wyników.
 * Fraza z samych spacji = brak frazy.
 */
export function filterCatalogLines(lines: LineListEntry[], { q, mode }: LinesView): LineListEntry[] {
  const inMode = mode === null ? lines : lines.filter((entry) => entry.mode === mode)
  return q.trim() === '' ? inMode : rankLines(inMode, q, inMode.length)
}

/** Płaska lista → `Record<GtfsMode, …>` dla `LineGrid` (wszystkie pięć kluczy, kolejność wejścia w obrębie trybu). */
export function groupByMode(lines: LineListEntry[]): Record<GtfsMode, LineListEntry[]> {
  const grouped: Record<GtfsMode, LineListEntry[]> = { metro: [], tram: [], bus: [], rail: [], other: [] }
  for (const entry of lines) grouped[entry.mode].push(entry)
  return grouped
}

/** Tryby, w których miasto ma linie, w kolejności prezentacji (`MODE_ORDER`) — źródło chipów filtra. */
export function availableModes(lines: LineListEntry[]): GtfsMode[] {
  const present = new Set(lines.map((entry) => entry.mode))
  return MODE_ORDER.filter((mode) => present.has(mode))
}
