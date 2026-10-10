'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import type { StationOption } from '@/components/StationSearch'
import { discoveryKey, MAX_PER_GROUP, rankLines, type DiscoveryResult } from '@/lib/discovery'
import { GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'
import { useCityLines, type CityLinesState } from './useCityLines'

export type SearchSourceState = 'idle' | 'loading' | 'ready' | 'failed' | 'disabled'

const DEBOUNCE_MS = 300
const MIN_PLACES_QUERY = 3
/** Ponowienie, gdy rozkład miejski się wczytuje (jak dawne `StationSearch`). */
const LOADING_RETRY_MS = 1500

const modeSchema = z.enum(['metro', 'tram', 'bus', 'rail', 'other'])
/** Odpowiedź serwera to dane spoza aplikacji — schemat na granicy (AGENTS.md #4); zły element odpada pojedynczo. */
const stationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  kind: z.enum(['rail', 'transit']),
  mode: modeSchema.optional(),
  modes: z.array(modeSchema).optional(),
  lines: z
    .array(
      z.object({
        routeId: z.string(),
        line: z.string(),
        mode: modeSchema,
        kind: z.enum(['regular', 'night', 'express', 'replacement', 'zone', 'local']),
      }),
    )
    .optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
})
const sourcesSchema = z.object({
  rail: z.enum(['ready', 'failed']),
  transit: z.enum(['ready', 'loading', 'failed', 'disabled']),
})

type Places = { stations: StationOption[]; rail: 'ready' | 'failed'; transit: 'ready' | 'loading' | 'failed' | 'disabled' }

/** `null` = zły kształt całej koperty (traktowane jak błąd). */
function parsePlaces(body: unknown): Places | null {
  if (typeof body !== 'object' || body === null) return null
  const { stations, sources, loading } = body as { stations?: unknown; sources?: unknown; loading?: unknown }
  if (!Array.isArray(stations)) return null
  const parsedSources = sourcesSchema.safeParse(sources)
  const rail = parsedSources.success ? parsedSources.data.rail : 'ready'
  // Starsza odpowiedź bez `sources`: tylko `loading: true` mówi o niepełnym wyniku.
  const transit = parsedSources.success ? parsedSources.data.transit : loading === true ? 'loading' : 'ready'
  return {
    stations: stations.flatMap((element) => {
      const parsed = stationSchema.safeParse(element)
      return parsed.success ? [parsed.data] : []
    }),
    rail,
    transit,
  }
}

type PlacesEntry = { key: string; places: Places | null }

const placesKey = (attempt: number, city: string | null, query: string) => `${attempt}\u0000${city ?? ''}\u0000${query}`

/** Id przechodzi wzorzec swojego rodzaju; przystanek miejski wymaga miasta (#4). */
function toResult(station: StationOption, city: string | null): DiscoveryResult | null {
  if (station.kind === 'rail') return STATION_ID_PATTERN.test(station.id) ? { kind: 'rail', station } : null
  if (station.kind === 'transit' && city !== null && GTFS_STOP_ID_PATTERN.test(station.id)) return { kind: 'stop', city, stop: station }
  return null
}

function capped(results: DiscoveryResult[]): DiscoveryResult[] {
  const seen = new Set<string>()
  return results.filter((result) => !seen.has(discoveryKey(result)) && seen.add(discoveryKey(result))).slice(0, MAX_PER_GROUP)
}

/**
 * Wspólna wyszukiwarka „Stacja, przystanek lub linia": miejsca z `/api/search` (od 3 znaków, debounce) i linie
 * filtrowane lokalnie z listy linii miasta (od 1 znaku). Źródła zawodzą niezależnie — wynik jednego nie znika
 * przez błąd drugiego. Odpowiedź nigdy nie trafia do wyniku, jeśli dotyczy innej frazy/miasta niż bieżące.
 */
export function useUnifiedSearch({ city, query, lineSource }: { city: string | null; query: string; lineSource?: CityLinesState }): {
  results: DiscoveryResult[]
  sources: { rail: SearchSourceState; transit: SearchSourceState; lines: SearchSourceState }
  retry: () => void
} {
  const trimmed = query.trim()
  const [attempt, setAttempt] = useState(0)
  const [entry, setEntry] = useState<PlacesEntry | null>(null)

  // Hooki bezwarunkowo: z `lineSource` własna kopia jest wyłączona (null), więc nie ma drugiego pobrania linii.
  const ownLines = useCityLines(lineSource === undefined ? city : null)
  const linesSource = lineSource ?? ownLines

  useEffect(() => {
    if (trimmed.length < MIN_PLACES_QUERY) return
    const key = placesKey(attempt, city, trimmed)
    const url = `/api/search?q=${encodeURIComponent(trimmed)}${city === null ? '' : `&city=${encodeURIComponent(city)}`}`
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>

    function run(): void {
      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status))
          return parsePlaces(await response.json())
        })
        .then((places) => {
          if (controller.signal.aborted) return
          setEntry({ key, places })
          if (places?.transit === 'loading') timer = setTimeout(run, LOADING_RETRY_MS)
        })
        .catch(() => {
          if (!controller.signal.aborted) setEntry({ key, places: null })
        })
    }

    timer = setTimeout(run, DEBOUNCE_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [trimmed, city, attempt])

  const placesActive = trimmed.length >= MIN_PLACES_QUERY
  const current = placesActive && entry?.key === placesKey(attempt, city, trimmed) ? entry : null
  const places = current?.places ?? null

  const rail: SearchSourceState = !placesActive ? 'idle' : current === null ? 'loading' : places === null ? 'failed' : places.rail
  const transit: SearchSourceState =
    city === null ? 'disabled' : !placesActive ? 'idle' : current === null ? 'loading' : places === null ? 'failed' : places.transit
  const linesFailed = linesSource.state === 'failed' && linesSource.lines === null
  const lines: SearchSourceState =
    city === null ? 'disabled' : trimmed === '' ? 'idle' : linesSource.state === 'loading' ? 'loading' : linesFailed ? 'failed' : 'ready'

  const sourceLines = linesSource.lines
  const results = useMemo(() => {
    const found = (places?.stations ?? []).flatMap((station) => toResult(station, city) ?? [])
    const lineResults: DiscoveryResult[] =
      city === null || sourceLines === null ? [] : rankLines(sourceLines, trimmed).map((line) => ({ kind: 'line', city, line }))
    return [
      ...capped(found.filter((result) => result.kind === 'rail')),
      ...capped(found.filter((result) => result.kind === 'stop')),
      ...capped(lineResults),
    ]
  }, [places, city, sourceLines, trimmed])

  // Najświeższy stan dla `retry` bez zmiany jego tożsamości.
  const latest = useRef({ placesFailed: false, linesFailed: false, refresh: linesSource.refresh })
  useEffect(() => {
    latest.current = { placesFailed: rail === 'failed' || transit === 'failed', linesFailed: lines === 'failed', refresh: linesSource.refresh }
  })
  const retry = useCallback(() => {
    if (latest.current.placesFailed) setAttempt((count) => count + 1)
    if (latest.current.linesFailed) latest.current.refresh()
  }, [])

  return { results, sources: { rail, transit, lines }, retry }
}
