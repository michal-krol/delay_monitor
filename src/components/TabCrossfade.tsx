'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useViewTransitions } from '@/hooks/useViewTransitions'

/**
 * Zmiana zakładki w obrębie jednej strony (Odjazdy↔Przyjazdy, zakładki przystanku): „to samo miejsce, inna treść”,
 * więc krzyżowy zanik, nie ślizg. `id` w `key` — zmiana zakładki to wyjście starej i wejście nowej treści (para
 * `share`), a zwykłe odświeżenie danych (to samo `id`) niczego nie odtwarza. Samo przejście uruchamia tylko
 * `startTransition` wokół zmiany stanu (zwykłe `setState` go nie wywołuje). Przy wyłączonych przejściach
 * (`useViewTransitions`) bez nazwy, animacji i `key` — treść zachowuje stan przy zmianie zakładki jak przed PR 6.
 */
export function TabCrossfade({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const on = useViewTransitions()
  return (
    <ViewTransition key={on ? id : undefined} name={on ? name : undefined} share={on ? 'auto' : 'none'} enter={on ? 'auto' : 'none'} default="none">
      {children}
    </ViewTransition>
  )
}
