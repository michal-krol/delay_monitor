'use client'

import { useSyncExternalStore } from 'react'

/** Próg Tailwinda `sm` (40rem): poniżej telefon (arkusz od dołu), od niego prawa kolumna/panel obok. */
export const SM_UP = '(min-width: 40rem)'

const hasMatchMedia = (): boolean => typeof window.matchMedia === 'function'

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
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => (hasMatchMedia() ? window.matchMedia(query).matches : serverValue),
    () => serverValue
  )
}
