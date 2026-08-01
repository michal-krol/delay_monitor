'use client'

import { useEffect, useState } from 'react'

export type Favourite = {
  id: string
  name: string
}

const STORAGE_KEY = 'pkp.favourites.v1'

function readStorage(): Favourite[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Favourite[]
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
