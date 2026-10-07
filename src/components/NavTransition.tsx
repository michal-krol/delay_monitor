'use client'

import { ViewTransition, type ReactNode } from 'react'
import { NAV_BACK, NAV_FORWARD, NAV_TAB } from '@/lib/navTransition'

/** Każdy typ nawigacji → własna animacja (klasy `.nav-*` w `globals.css`); bez typu: nic. */
const BY_TYPE = { [NAV_FORWARD]: NAV_FORWARD, [NAV_BACK]: NAV_BACK, [NAV_TAB]: NAV_TAB, default: 'none' } as const

/**
 * Kierunkowe przejście całej treści strony (`PageShell` owija nim swój korzeń — musi to być zewnętrzny element strony,
 * patrz komentarz tam). Wejście i wyjście reagują wyłącznie na typy z `navTransition.ts`; Suspense, odświeżenia
 * i nawigacja bez typu (`default: 'none'`) stoją w miejscu. Gdzie przejścia są niedozwolone (reduced-motion,
 * silnik poza Chromium) `src/lib/viewTransitionGate.ts` ukrywa `document.startViewTransition` — drzewo zostaje to samo.
 */
export function NavTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">
      {children}
    </ViewTransition>
  )
}
