'use client'

import { useSyncExternalStore } from 'react'
import { useReducedMotion } from './useMediaQuery'

/**
 * Silnik Chromium (Chrome, Edge, Samsung Internet): ma `document.startViewTransition` ORAZ `navigator.userAgentData`
 * (tego drugiego nie ma Safari ani Firefox). Powód zawężenia: w buildzie WebKit użytym przez Playwright
 * `startViewTransition` wieszał stronę przy każdej nawigacji, a prawdziwego iPhone'a jeszcze nie sprawdzono —
 * Safari dostaje po prostu stronę bez przejść. Odblokowanie po click-QA na urządzeniu (`.claude/rules/ui-motion.md`).
 */
function supportsViewTransitions(): boolean {
  return typeof document.startViewTransition === 'function' && 'userAgentData' in navigator
}

const noSubscription = () => () => {}

/**
 * Czy wolno animować przejściami widoku: obsługiwany silnik i brak `prefers-reduced-motion`. Komponenty
 * `ViewTransition` są montowane zawsze (stały kształt drzewa, bez ponownego montowania przy hydracji), a ten hook
 * tylko włącza ich animacje — wyłączone = wszystkie właściwości `'none'`, więc React nie woła `startViewTransition`.
 * Na serwerze `false`.
 */
export function useViewTransitions(): boolean {
  const reduced = useReducedMotion()
  const supported = useSyncExternalStore(noSubscription, supportsViewTransitions, () => false)
  return supported && !reduced
}
