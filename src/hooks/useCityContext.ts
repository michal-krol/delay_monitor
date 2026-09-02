'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
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

function parse(value: string | null): string | null {
  if (value === null) return null
  const result = cityIdSchema.safeParse(value)
  return result.success ? result.data : null
}

// Wspólny stan między wszystkimi instancjami hooka (CitySwitcher, Sidebar,
// strony). `useSyncExternalStore` zamiast React Context — mniej wiązania
// w drzewie, a i tak jeden proces w przeglądarce.
let current: string | null = null
let hydrated = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function readInitial(): string | null {
  try {
    const fromUrl = parse(new URLSearchParams(window.location.search).get(URL_PARAM))
    if (fromUrl !== null) return fromUrl
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? null : parse(JSON.parse(raw))
  } catch {
    return null
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCityContext() {
  const city = useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )
  const loaded = useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false
  )

  useEffect(() => {
    if (hydrated) return
    // Adres URL ma pierwszeństwo nad localStorage — link jest współdzielony.
    current = readInitial()
    hydrated = true
    emit()
  }, [])

  const setCity = useCallback((next: string | null) => {
    current = next
    try {
      if (next === null) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // brak localStorage (tryb prywatny) — kontekst zostaje tylko w URL-u
    }
    patchUrlParams({ [URL_PARAM]: next })
    emit()
  }, [])

  return { city, setCity, loaded }
}

/** Do testów: kasuje wspólny stan między przypadkami. */
export function __resetCityContext(): void {
  current = null
  hydrated = false
  listeners.clear()
}
