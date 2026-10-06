'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { NAV_BACK, NAV_FORWARD, NAV_TAB } from '@/lib/navTransition'

/** Każdy typ nawigacji → własna animacja (klasy `.nav-*` w `globals.css`); bez typu: nic. */
const BY_TYPE = { [NAV_FORWARD]: NAV_FORWARD, [NAV_BACK]: NAV_BACK, [NAV_TAB]: NAV_TAB, default: 'none' } as const

/**
 * Kierunkowe przejście całej treści strony (`PageShell` owija nim swój korzeń — musi to być zewnętrzny element strony, patrz komentarz tam). Wejście i wyjście reagują
 * wyłącznie na typy z `navTransition.ts`; Suspense, odświeżenia i nawigacja bez typu (`default: 'none'`) stoją w miejscu.
 * Pod `prefers-reduced-motion` nie montuje `ViewTransition` w ogóle — przeglądarka nie dostaje
 * `startViewTransition`, więc nie ma żadnych pseudoelementów przejścia.
 */
export function NavTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  return (
    <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">
      {children}
    </ViewTransition>
  )
}
