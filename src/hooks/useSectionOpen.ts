'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useMediaQuery } from './useMediaQuery'

const STORAGE_KEY = 'monitor.linesSections.v1'
const NARROW_QUERY = '(max-width: 767px)'
/** Sekcja z większą liczbą linii startuje zwinięta — długa lista zasłania resztę strony. */
const MAX_LINES_OPEN_BY_DEFAULT = 30
const MAX_KEY_LENGTH = 40

type OpenMap = Record<string, boolean>

const storeSchema = z.record(z.string(), z.unknown())

function validKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_KEY_LENGTH
}

/** `localStorage` to wejście spoza aplikacji (AGENTS.md #4): zły klucz/wartość odpada pojedynczo. */
function readStorage(): OpenMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return {}
    const map: OpenMap = {}
    for (const [key, value] of Object.entries(parsed.data)) {
      if (validKey(key) && typeof value === 'boolean') map[key] = value
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Stan rozwinięcia sekcji listy linii. Zapisana wartość wygrywa; bez niej: wąski
 * ekran → zwinięta, szeroki → rozwinięta, gdy linii ≤ 30. Odczyt w efekcie (nie w
 * renderze) — przed nim `isOpen` zwraca wartości domyślne dla szerokiego ekranu, więc
 * sekcje powinny się renderować dopiero po wczytaniu listy linii (brak migotania).
 */
export function useSectionOpen() {
  const [stored, setStored] = useState<OpenMap>({})
  // „Wąsko” na żywo (obrót telefonu, zmiana okna); w SSR „szeroko” — jak przed odczytem pamięci.
  const narrow = useMediaQuery(NARROW_QUERY, false)
  const storedRef = useRef<OpenMap>({})

  useEffect(() => {
    const initial = readStorage()
    storedRef.current = initial
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(initial)
  }, [])

  const isOpen = useCallback(
    (key: string, lineCount: number): boolean =>
      stored[key] ?? (!narrow && lineCount <= MAX_LINES_OPEN_BY_DEFAULT),
    [stored, narrow],
  )

  /**
   * Zapis tylko realnej zmiany: `open` równe aktualnemu stanowi (zapisanemu albo domyślnemu dla
   * `lineCount`) się pomija. React odpala `toggle` na `<details>` także przy programowej zmianie
   * `open` — bez tej bramki zapisalibyśmy wartość domyślną i zamrozili ją na stałe.
   */
  const setOpen = useCallback((key: string, open: boolean, lineCount: number): void => {
    if (!validKey(key)) return
    const current = storedRef.current[key] ?? (!narrow && lineCount <= MAX_LINES_OPEN_BY_DEFAULT)
    if (current === open) return
    const next = { ...storedRef.current, [key]: open }
    storedRef.current = next
    setStored(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Pełny/zablokowany storage — sekcja działa do końca sesji, tylko się nie zapamięta.
    }
  }, [narrow])

  return { isOpen, setOpen }
}
