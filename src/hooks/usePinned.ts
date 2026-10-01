'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { CITY_ID_PATTERN, GTFS_STOP_ID_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

/**
 * Pulpit przypina rzeczy z różnych światów: stacje kolejowe PKP i (docelowo)
 * przystanki komunikacji miejskiej z feedów GTFS. `city` jest OSOBNYM polem, nie
 * sklejonym prefiksem w stringu — dzięki temu nic nie trzeba parsować przy
 * odczycie, a przypięcia z różnych miast żyją obok siebie na jednym Pulpicie.
 */
export type PinnedItem =
  | { kind: 'pkp'; id: string; name: string }
  /**
   * `member: true` = przypięty JEDEN przystanek zespołu (`id` to on, `name` ma już numer:
   * „Centrum 02"); brak = cały zespół. Przypinamy to, co user widzi. Wpisy sprzed tej
   * flagi czytamy jako zespół, nawet gdy `id` wskazuje przystanek (stary deep-link).
   */
  | { kind: 'gtfs'; city: string; id: string; name: string; member?: true }

/** Klucz tożsamości wpisu — jedyne miejsce, które zna kształt sklejenia. */
export function pinnedKey(pinnedItem: PinnedItem): string {
  // Jeden przystanek ma osobny klucz od zespołu: starsze wpisy zespołu bywają zapisane pod
  // id przystanku (deep-link, pin z mapy) — bez sufiksu „Centrum 02" kolidowałby z nimi.
  if (pinnedItem.kind === 'pkp') return `pkp:${pinnedItem.id}`
  return `gtfs:${pinnedItem.city}:${pinnedItem.id}${pinnedItem.member === true ? ':przystanek' : ''}`
}

const V2_KEY = 'monitor.favourites.v2' // prefiks `pkp.` przestał być prawdziwy

/**
 * `localStorage` to wejście spoza aplikacji: treść mogła zostać zapisana przez
 * starszą wersję, ręcznie zmieniona albo uszkodzona. `JSON.parse(...) as
 * PinnedItem[]` niczego nie sprawdzał — asercja typu znika przy kompilacji, więc
 * `{"a":1}` przechodził dalej jako „lista przypiętych" i wywracał render na
 * `pinnedItems.map`. Efektem była biała strona, której użytkownik nie ma jak
 * naprawić bez narzędzi deweloperskich.
 *
 * Odsiewamy pojedyncze uszkodzone wpisy zamiast odrzucać całą listę: jeden zły
 * rekord nie powinien kasować pozostałych przypiętych.
 */
const pinnedV2Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pkp'), id: z.string().regex(STATION_ID_PATTERN), name: z.string() }),
  z.object({
    kind: z.literal('gtfs'),
    city: z.string().regex(CITY_ID_PATTERN),
    id: z.string().regex(GTFS_STOP_ID_PATTERN),
    name: z.string(),
    member: z.literal(true).optional(),
  }),
])

function parseList(raw: string, parseEntry: (entry: unknown) => PinnedItem | null): PinnedItem[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry) => {
    const pinnedItem = parseEntry(entry)
    return pinnedItem ? [pinnedItem] : []
  })
}

function readStorage(): PinnedItem[] {
  try {
    const raw = window.localStorage.getItem(V2_KEY)
    if (raw === null) return []
    return parseList(raw, (entry) => {
      const result = pinnedV2Schema.safeParse(entry)
      return result.success ? result.data : null
    })
  } catch {
    return []
  }
}

function writeStorage(pinnedItems: PinnedItem[]): void {
  try {
    window.localStorage.setItem(V2_KEY, JSON.stringify(pinnedItems))
  } catch {
    // Pełny albo zablokowany storage — przypięcie działa do końca sesji, tylko bez zapisu.
    // Wyjątek z updatera `setState` wywróciłby cały render (#7).
  }
}

export function usePinned() {
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Deliberately deferred to an effect: reading localStorage during render
    // would produce a client/server markup mismatch on the first paint.
    const initial = readStorage()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedItems(initial)
    setLoaded(true)
  }, [])

  function addPinned(pinnedItem: PinnedItem): void {
    const key = pinnedKey(pinnedItem)
    setPinnedItems((current) => {
      if (current.some((item) => pinnedKey(item) === key)) return current
      const next = [...current, pinnedItem]
      writeStorage(next)
      return next
    })
  }

  function removePinned(key: string): void {
    setPinnedItems((current) => {
      const next = current.filter((item) => pinnedKey(item) !== key)
      writeStorage(next)
      return next
    })
  }

  function isPinned(key: string): boolean {
    return pinnedItems.some((item) => pinnedKey(item) === key)
  }

  return { pinnedItems, loaded, addPinned, removePinned, isPinned }
}
