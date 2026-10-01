'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { CITY_ID_PATTERN, GTFS_ROUTE_ID_PATTERN } from '@/lib/validation'

const STORAGE_KEY = 'monitor.recentLines.v1'
const MAX_RECENT = 6

// Kształt `{ [miasto]: [idTrasy, ...] }` — elementy sprawdzamy osobno (patrz `readAll`).
// Wartość miasta, która nie jest tablicą, odpada pojedynczo (`readAll`) — nie kasuje pozostałych miast.
const storeSchema = z.record(z.string(), z.unknown())

type Store = Record<string, string[]>

/**
 * `localStorage` to wejście spoza aplikacji (AGENTS.md #4). Odsiewamy pojedyncze złe
 * miasta i złe id zamiast odrzucać całość — jeden uszkodzony wpis nie kasuje reszty.
 */
function readAll(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return {}
    const store: Store = {}
    for (const [city, ids] of Object.entries(parsed.data)) {
      if (!CITY_ID_PATTERN.test(city) || !Array.isArray(ids)) continue
      const valid = ids.filter((id): id is string => typeof id === 'string' && GTFS_ROUTE_ID_PATTERN.test(id))
      store[city] = [...new Set(valid)].slice(0, MAX_RECENT)
    }
    return store
  } catch {
    return {}
  }
}

function writeAll(store: Store): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Pełny/zablokowany storage — lista działa do końca sesji, tylko się nie zapamięta.
  }
}

/**
 * „Ostatnio oglądane" linie wybranego miasta, najnowsza pierwsza. Odczyt w efekcie
 * (nie w renderze), żeby nie rozjechać znacznika serwer/klient — jak w `usePinned`.
 */
export function useRecentLines(city: string) {
  const [recent, setRecent] = useState<string[]>([])
  const recentRef = useRef<string[]>([])

  useEffect(() => {
    const initial = readAll()[city] ?? []
    recentRef.current = initial
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(initial)
  }, [city])

  const record = useCallback(
    (routeId: string): void => {
      if (!CITY_ID_PATTERN.test(city) || !GTFS_ROUTE_ID_PATTERN.test(routeId)) return
      const next = [routeId, ...recentRef.current.filter((id) => id !== routeId)].slice(0, MAX_RECENT)
      recentRef.current = next
      setRecent(next)
      // Inne miasta bierzemy świeżo z storage, żeby ich nie nadpisać.
      writeAll({ ...readAll(), [city]: next })
    },
    [city],
  )

  return { recent, record }
}
