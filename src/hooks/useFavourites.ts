'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'

export type Favourite = {
  id: string
  name: string
}

const STORAGE_KEY = 'pkp.favourites.v1'

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
const favouriteSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
})

function readStorage(): Favourite[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((entry) => {
      const result = favouriteSchema.safeParse(entry)
      return result.success ? [result.data] : []
    })
  } catch {
    return []
  }
}

function writeStorage(favourites: Favourite[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favourites))
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<Favourite[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Deliberately deferred to an effect: reading localStorage during render
    // would produce a client/server markup mismatch on the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavourites(readStorage())
    setLoaded(true)
  }, [])

  function addFavourite(favourite: Favourite): void {
    setFavourites((current) => {
      if (current.some((item) => item.id === favourite.id)) return current
      const next = [...current, favourite]
      writeStorage(next)
      return next
    })
  }

  function removeFavourite(id: string): void {
    setFavourites((current) => {
      const next = current.filter((item) => item.id !== id)
      writeStorage(next)
      return next
    })
  }

  function isFavourite(id: string): boolean {
    return favourites.some((item) => item.id === id)
  }

  return { favourites, loaded, addFavourite, removeFavourite, isFavourite }
}
