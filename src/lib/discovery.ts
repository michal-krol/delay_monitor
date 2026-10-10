import type { StationOption } from '@/components/StationSearch'
import type { LineListEntry } from '@/lib/gtfs/query'
import { normalizeForSearch } from '@/lib/search'
import {
  CITY_ID_PATTERN,
  encodeStopIdForPathSegment,
  GTFS_ROUTE_ID_PATTERN,
  GTFS_STOP_ID_PATTERN,
  STATION_ID_PATTERN,
} from '@/lib/validation'

/**
 * Wynik wspólnej wyszukiwarki („Stacja, przystanek lub linia"): stacja PKP,
 * przystanek GTFS miasta albo linia GTFS miasta. Czysty kontrakt — bez sieci i Reacta.
 */
export type DiscoveryResult =
  | { kind: 'rail'; station: StationOption }
  | { kind: 'stop'; city: string; stop: StationOption }
  | { kind: 'line'; city: string; line: LineListEntry }

/** Maksymalna liczba wyników w jednej grupie (stacje / przystanki / linie). */
export const MAX_PER_GROUP = 8

/**
 * Linie pasujące do frazy: numer równy → numer zaczyna się od frazy → fraza w nazwie
 * trasy. Wewnątrz progu kolejność wejścia (lista jest już posortowana naturalnie).
 * Bez preferencji rodzaju — „20" daje linię 20 przed 200, niezależnie od środka transportu.
 */
export function rankLines(lines: LineListEntry[], query: string, limit = MAX_PER_GROUP): LineListEntry[] {
  const needle = normalizeForSearch(query)
  if (needle === '') return []
  const exact: LineListEntry[] = []
  const prefix: LineListEntry[] = []
  const other: LineListEntry[] = []
  for (const line of lines) {
    const number = normalizeForSearch(line.line)
    if (number === needle) exact.push(line)
    else if (number.startsWith(needle)) prefix.push(line)
    else if (normalizeForSearch(line.longName).includes(needle)) other.push(line)
  }
  return [...exact, ...prefix, ...other].slice(0, limit)
}

/**
 * Wewnętrzny adres wyniku albo `null`, gdy identyfikator lub miasto nie przechodzą
 * wzorców (#4). Adres budujemy wyłącznie z zwalidowanych pól, nigdy z niczego innego.
 */
export function discoveryHref(result: DiscoveryResult): string | null {
  switch (result.kind) {
    case 'rail': {
      const { id, name } = result.station
      if (!STATION_ID_PATTERN.test(id)) return null
      return `/station/${id}?name=${encodeURIComponent(name)}`
    }
    case 'stop': {
      const { id, name } = result.stop
      if (!CITY_ID_PATTERN.test(result.city) || !GTFS_STOP_ID_PATTERN.test(id)) return null
      return `/city/${result.city}/stop/${encodeStopIdForPathSegment(id)}?name=${encodeURIComponent(name)}`
    }
    case 'line': {
      const { routeId } = result.line
      if (!CITY_ID_PATTERN.test(result.city) || !GTFS_ROUTE_ID_PATTERN.test(routeId)) return null
      return `/city/${result.city}/line/${encodeURIComponent(routeId)}`
    }
  }
}

/** Stabilny klucz wyniku (React `key`, deduplikacja); stacja PKP i przystanek o tym samym id się nie zlewają. */
export function discoveryKey(result: DiscoveryResult): string {
  switch (result.kind) {
    case 'rail':
      return `rail:${result.station.id}`
    case 'stop':
      return `stop:${result.city}:${result.stop.id}`
    case 'line':
      return `line:${result.city}:${result.line.routeId}`
  }
}
