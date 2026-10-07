'use client'

import { ViewTransition, type ReactNode } from 'react'
import { useViewTransitions } from '@/hooks/useViewTransitions'
import { NAV_BACK, NAV_FORWARD, NAV_TAB } from '@/lib/navTransition'

/** Każdy typ nawigacji → własna animacja (klasy `.nav-*` w `globals.css`); bez typu: nic. */
const BY_TYPE = { [NAV_FORWARD]: NAV_FORWARD, [NAV_BACK]: NAV_BACK, [NAV_TAB]: NAV_TAB, default: 'none' } as const

/**
 * Kierunkowe przejście całej treści strony (`PageShell` owija nim swój korzeń — musi to być zewnętrzny element strony,
 * patrz komentarz tam). Wejście i wyjście reagują wyłącznie na typy z `navTransition.ts`; Suspense, odświeżenia
 * i nawigacja bez typu (`default: 'none'`) stoją w miejscu. Gdy przejścia są wyłączone (`useViewTransitions`:
 * reduced-motion albo silnik bez sprawdzonej obsługi) wszystkie animacje są `'none'` — przeglądarka nie dostaje
 * `startViewTransition`, a drzewo ma ten sam kształt (bez ponownego montowania).
 */
export function NavTransition({ children }: { children: ReactNode }) {
  const on = useViewTransitions()
  return (
    <ViewTransition enter={on ? BY_TYPE : 'none'} exit={on ? BY_TYPE : 'none'} default="none">
      {children}
    </ViewTransition>
  )
}
