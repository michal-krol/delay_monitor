'use client'

import { useSyncExternalStore } from 'react'

/** Próg Tailwinda `sm` (40rem): poniżej telefon (arkusz od dołu), od niego prawa kolumna/panel obok. */
export const SM_UP = '(min-width: 40rem)'

/** Preferencja systemu: bez animacji ruchu. Wszystkie efekty PR 6 wyłączają się pod tym zapytaniem. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const hasMatchMedia = (): boolean => typeof window.matchMedia === 'function'

// Jedna `MediaQueryList` na zapytanie: `getSnapshot` woła się przy każdym renderze (tablice co 30 s).
// Pamięć ważna dla bieżącego `window.matchMedia` (testy go podmieniają).
const lists = new Map<string, MediaQueryList>()
let listsFor: typeof window.matchMedia | null = null
function mediaList(query: string): MediaQueryList {
  if (listsFor !== window.matchMedia) {
    lists.clear()
    listsFor = window.matchMedia
  }
  let list = lists.get(query)
  if (list === undefined) {
    list = window.matchMedia(query)
    lists.set(query, list)
  }
  return list
}

/**
 * Dopasowanie media query, na żywo. `serverValue` obowiązuje w SSR i bez `matchMedia`:
 * tablice biorą „szeroko” (desktop bez mignięcia; na telefonie CSS chowa kolumnę do hydracji),
 * mapa „wąsko”. Używaj tylko tam, gdzie CSS nie wystarcza — gdy treść ma istnieć w JEDNYM
 * miejscu (kolumna albo arkusz), a nie w dwóch kopiach ukrytych klasą.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!hasMatchMedia()) return () => {}
      const media = mediaList(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => (hasMatchMedia() ? mediaList(query).matches : serverValue),
    () => serverValue
  )
}

/** `true`, gdy użytkownik prosi o ograniczenie ruchu; bez `matchMedia` (SSR, jsdom) `false` — nie ma preferencji do uszanowania. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION, false)
}
