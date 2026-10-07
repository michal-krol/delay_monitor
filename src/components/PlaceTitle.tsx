'use client'

import { ViewTransition, type ReactNode } from 'react'
import { placeTransitionName } from '@/lib/navTransition'

/**
 * Tytuł miejsca jako współdzielony element przejścia: kafelek Pulpitu i nagłówek tablicy o tym samym `id`
 * „przepływają” w siebie. Jedna nazwa na `id` w dokumencie (duplikat przerywa całe przejście), dlatego
 * tylko kafelki Pulpitu i nagłówki tablic — nie wyniki wyszukiwania, które stoją obok kafelków.
 * Gdzie przejścia są niedozwolone, patrz `src/lib/viewTransitionGate.ts`.
 */
export function PlaceTitle({ kind, id, children }: { kind: 'pkp' | 'gtfs'; id: string; children: ReactNode }) {
  return (
    <ViewTransition name={placeTransitionName(kind, id)} share="morph" default="none">
      {children}
    </ViewTransition>
  )
}
