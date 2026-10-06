'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useMediaQuery'

/**
 * Zmiana zakładki w obrębie jednej strony (Odjazdy↔Przyjazdy, zakładki przystanku): „to samo miejsce, inna treść”,
 * więc krzyżowy zanik, nie ślizg. `id` w `key` — zmiana zakładki to wyjście starej i wejście nowej treści (para
 * `share`), a zwykłe odświeżenie danych (to samo `id`) niczego nie odtwarza. Samo przejście uruchamia tylko
 * `startTransition` wokół zmiany stanu (zwykłe `setState` go nie wywołuje). Pod `prefers-reduced-motion` goła treść.
 */
export function TabCrossfade({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  return (
    <ViewTransition key={id} name={name} share="auto" enter="auto" default="none">
      {children}
    </ViewTransition>
  )
}
