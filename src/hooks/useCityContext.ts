'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { patchUrlParams } from '@/lib/urlState'
import { CITY_ID_PATTERN } from '@/lib/validation'

const STORAGE_KEY = 'monitor.cityContext.v1'
const URL_PARAM = 'miasto'

/**
 * `null` = kontekst „Cała Polska — kolej" (dzisiejsze zachowanie aplikacji).
 * Nieprawidłowy/uszkodzony wpis jest po cichu ignorowany, nigdy nie wywraca
 * renderu (AGENTS.md #4). Format tylko — czy takie miasto istnieje, rozstrzyga
 * lista z `/api/cities` w `CitySwitcher`.
 */
const cityIdSchema = z.string().regex(CITY_ID_PATTERN)

function readStored(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = cityIdSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function useCityContext() {
  const [city, setCityState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Adres URL ma pierwszeństwo nad localStorage — link jest współdzielony.
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM)
    const parsedUrl = fromUrl === null ? null : cityIdSchema.safeParse(fromUrl)
    const initial = parsedUrl && parsedUrl.success ? parsedUrl.data : readStored()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCityState(initial)
    setLoaded(true)
  }, [])

  const setCity = useCallback((next: string | null) => {
    setCityState(next)
    try {
      if (next === null) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // brak localStorage (tryb prywatny) — kontekst zostaje tylko w URL-u
    }
    patchUrlParams({ [URL_PARAM]: next })
  }, [])

  return { city, setCity, loaded }
}
