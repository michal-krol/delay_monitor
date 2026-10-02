'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { CITY_ID_PATTERN, encodeStopIdForPathSegment, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

const STORAGE_KEY = 'monitor.recentPlaces.v1'
export const MAX_RECENT_PLACES = 8

/**
 * „Ostatnio oglądane" miejsca: stacje PKP i przystanki GTFS, najnowsze pierwsze.
 * Kształt jak `PinnedItem` (miasto osobnym polem), ale `member` to id przystanku,
 * nie flaga — z samego wpisu da się zbudować link (`recentPlaceHref`).
 */
export type RecentPlace =
  | { kind: 'pkp'; id: string; name: string }
  /** `id` = zespół (groupId); `member` = id jednego przystanku, wtedy `name` ma numer („Centrum 02"). */
  | { kind: 'gtfs'; city: string; id: string; name: string; member?: string }

/** Klucz tożsamości wpisu — zespół i jego pojedynczy przystanek to osobne wpisy. */
export function recentPlaceKey(place: RecentPlace): string {
  if (place.kind === 'pkp') return `pkp:${place.id}`
  return `gtfs:${place.city}:${place.id}${place.member !== undefined ? `:${place.member}` : ''}`
}

export function recentPlaceHref(place: RecentPlace): string {
  if (place.kind === 'pkp') return `/station/${place.id}?name=${encodeURIComponent(place.name)}`
  const base = `/city/${place.city}/stop/${encodeStopIdForPathSegment(place.id)}`
  return place.member !== undefined ? `${base}?przystanek=${encodeURIComponent(place.member)}` : base
}

const nameSchema = z.string().min(1).max(120)
const placeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pkp'), id: z.string().regex(STATION_ID_PATTERN), name: nameSchema }),
  z.object({
    kind: z.literal('gtfs'),
    city: z.string().regex(CITY_ID_PATTERN),
    id: z.string().regex(GTFS_STOP_ID_PATTERN),
    name: nameSchema,
    member: z.string().regex(GTFS_STOP_ID_PATTERN).optional(),
  }),
])

/**
 * `localStorage` to wejście spoza aplikacji (AGENTS.md #4): odsiewamy pojedyncze złe
 * wpisy zamiast odrzucać całość, żeby jeden uszkodzony nie kasował reszty.
 */
function readStorage(): RecentPlace[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const result = placeSchema.safeParse(entry)
      return result.success ? [result.data] : []
    })
  } catch {
    return []
  }
}

function writeStorage(places: RecentPlace[]): void {
  try {
    if (places.length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(places))
  } catch {
    // Pełny/zablokowany storage — lista działa do końca sesji, tylko się nie zapamięta.
  }
}

/** Odczyt w efekcie (nie w renderze), żeby nie rozjechać znacznika serwer/klient — jak w `usePinned`. */
export function useRecentPlaces() {
  const [places, setPlaces] = useState<RecentPlace[]>([])
  const [loaded, setLoaded] = useState(false)
  const placesRef = useRef<RecentPlace[]>([])

  useEffect(() => {
    const initial = readStorage()
    placesRef.current = initial
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaces(initial)
    setLoaded(true)
  }, [])

  const record = useCallback((place: RecentPlace): void => {
    const key = recentPlaceKey(place)
    // Storage świeżo (inne karty/instancje hooka nie są nadpisywane); lista z pamięci dopełnia go,
    // gdy zapis się nie udaje — inaczej każdy kolejny wpis zaczynałby od pustej listy.
    const stored = readStorage()
    const base = [...stored, ...placesRef.current.filter((p) => !stored.some((s) => recentPlaceKey(s) === recentPlaceKey(p)))]
    const next = [place, ...base.filter((p) => recentPlaceKey(p) !== key)].slice(0, MAX_RECENT_PLACES)
    placesRef.current = next
    setPlaces(next)
    writeStorage(next)
  }, [])

  const clear = useCallback((): void => {
    placesRef.current = []
    setPlaces([])
    writeStorage([])
  }, [])

  return { places, loaded, record, clear }
}
