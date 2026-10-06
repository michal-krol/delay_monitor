'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { placeTransitionName } from '@/lib/navTransition'

/**
 * Tytuł miejsca jako współdzielony element przejścia: kafelek Pulpitu i nagłówek tablicy o tym samym `id`
 * „przepływają” w siebie. Jedna nazwa na `id` w dokumencie (duplikat przerywa całe przejście), dlatego
 * tylko kafelki Pulpitu i nagłówki tablic — nie wyniki wyszukiwania, które stoją obok kafelków.
 */
export function PlaceTitle({ kind, id, children }: { kind: 'pkp' | 'gtfs'; id: string; children: ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  return (
    <ViewTransition name={placeTransitionName(kind, id)} share="morph" default="none">
      {children}
    </ViewTransition>
  )
}
