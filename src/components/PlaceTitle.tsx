'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useViewTransitions } from '@/hooks/useViewTransitions'
import { placeTransitionName } from '@/lib/navTransition'

/**
 * Tytuł miejsca jako współdzielony element przejścia: kafelek Pulpitu i nagłówek tablicy o tym samym `id`
 * „przepływają” w siebie. Jedna nazwa na `id` w dokumencie (duplikat przerywa całe przejście), dlatego
 * tylko kafelki Pulpitu i nagłówki tablic — nie wyniki wyszukiwania, które stoją obok kafelków.
 * Przy wyłączonych przejściach (`useViewTransitions`) bez nazwy i bez morfu.
 */
export function PlaceTitle({ kind, id, children }: { kind: 'pkp' | 'gtfs'; id: string; children: ReactNode }) {
  const on = useViewTransitions()
  return (
    <ViewTransition name={on ? placeTransitionName(kind, id) : undefined} share={on ? 'morph' : 'none'} default="none">
      {children}
    </ViewTransition>
  )
}
