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
export type Favourite =
  | { kind: 'pkp'; id: string; name: string }
  | { kind: 'gtfs'; city: string; id: string; name: string }

/** Klucz tożsamości wpisu — jedyne miejsce, które zna kształt sklejenia. */
export function favouriteKey(favourite: Favourite): string {
  return favourite.kind === 'pkp'
    ? `pkp:${favourite.id}`
    : `gtfs:${favourite.city}:${favourite.id}`
}

const V2_KEY = 'monitor.favourites.v2' // prefiks `pkp.` przestał być prawdziwy

/**
 * `localStorage` to wejście spoza aplikacji: treść mogła zostać zapisana przez
 * starszą wersję, ręcznie zmieniona albo uszkodzona. `JSON.parse(...) as
 * Favourite[]` niczego nie sprawdzał — asercja typu znika przy kompilacji, więc
 * `{"a":1}` przechodził dalej jako „lista ulubionych" i wywracał render na
 * `favourites.map`. Efektem była biała strona, której użytkownik nie ma jak
 * naprawić bez narzędzi deweloperskich.
 *
 * Odsiewamy pojedyncze uszkodzone wpisy zamiast odrzucać całą listę: jeden zły
 * rekord nie powinien kasować pozostałych ulubionych.
 */
const favouriteV2Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pkp'), id: z.string().regex(STATION_ID_PATTERN), name: z.string() }),
  z.object({
    kind: z.literal('gtfs'),
    city: z.string().regex(CITY_ID_PATTERN),
    id: z.string().regex(GTFS_STOP_ID_PATTERN),
    name: z.string(),
  }),
])

function parseList(raw: string, parseEntry: (entry: unknown) => Favourite | null): Favourite[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry) => {
    const favourite = parseEntry(entry)
    return favourite ? [favourite] : []
  })
}

function readStorage(): Favourite[] {
  try {
    const raw = window.localStorage.getItem(V2_KEY)
    if (raw === null) return []
    return parseList(raw, (entry) => {
      const result = favouriteV2Schema.safeParse(entry)
      return result.success ? result.data : null
    })
  } catch {
    return []
  }
}

function writeStorage(favourites: Favourite[]): void {
  window.localStorage.setItem(V2_KEY, JSON.stringify(favourites))
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<Favourite[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Deliberately deferred to an effect: reading localStorage during render
    // would produce a client/server markup mismatch on the first paint.
    const initial = readStorage()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavourites(initial)
    setLoaded(true)
  }, [])

  function addFavourite(favourite: Favourite): void {
    const key = favouriteKey(favourite)
    setFavourites((current) => {
      if (current.some((item) => favouriteKey(item) === key)) return current
      const next = [...current, favourite]
      writeStorage(next)
      return next
    })
  }

  function removeFavourite(key: string): void {
    setFavourites((current) => {
      const next = current.filter((item) => favouriteKey(item) !== key)
      writeStorage(next)
      return next
    })
  }

  function isFavourite(key: string): boolean {
    return favourites.some((item) => favouriteKey(item) === key)
  }

  return { favourites, loaded, addFavourite, removeFavourite, isFavourite }
}
