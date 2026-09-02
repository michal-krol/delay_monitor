'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { CITY_ID_PATTERN } from '@/lib/validation'

const STORAGE_KEY = 'monitor.cityContext.v1'

/**
 * Wybrane miasto na ekranie Odjazdy/Przyjazdy. `null` = jeszcze nie wybrano
 * (stan przejściowy przy pierwszej wizycie — trasa `/miasto` dobiera wtedy
 * domyślne miasto). NIE ma już kontekstu „Cała Polska" — ekran jest zawsze
 * przypisany do konkretnego miasta, a Pulpit nie ma żadnego kontekstu.
 *
 * Źródłem prawdy jest segment ścieżki `/miasto/[city]`; tu trzymamy tylko
 * `localStorage` (żeby menu wracało do ostatniego miasta) + wspólny stan
 * między instancjami hooka.
 */
const cityIdSchema = z.string().regex(CITY_ID_PATTERN)

function parse(value: string | null): string | null {
  if (value === null) return null
  const result = cityIdSchema.safeParse(value)
  return result.success ? result.data : null
}

// Wspólny stan między wszystkimi instancjami hooka (picker, sidebar, strony).
// `useSyncExternalStore` zamiast React Context — mniej wiązania w drzewie.
let current: string | null = null
let hydrated = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function readInitial(): string | null {
  try {
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
      // brak localStorage (tryb prywatny) — kontekst zostaje w segmencie ścieżki
    }
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
