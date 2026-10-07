'use client'

import { useCallback, type RefCallback } from 'react'
import { useReducedMotion } from './useMediaQuery'

const DURATION_MS = 160
/** Powyżej tylu dzieci (np. 100 wierszy po przełączeniu Odjazdy↔Przyjazdy) efekty trwają 0 ms — bez lawiny animacji. */
const HEAVY_LIST = 60

type Coords = { top: number; left: number; width: number; height: number }

function instant(el: Element): KeyframeEffect {
  return new KeyframeEffect(el, [{ opacity: 1 }, { opacity: 1 }], { duration: 0 })
}

/**
 * Własny plugin AutoAnimate: wejście = krótkie wsunięcie z przezroczystości, wyjście = natychmiast (usunięty wiersz
 * zostaje na chwilę `position: absolute`, a przy tabeli to rodzi migotanie), przesunięcie = płynne dojechanie.
 */
export function rowPlugin(el: Element, action: 'add' | 'remove' | 'remain', oldCoords?: Coords, newCoords?: Coords): KeyframeEffect {
  if ((el.parentElement?.childElementCount ?? 0) > HEAVY_LIST || action === 'remove') return instant(el)
  if (action === 'add') {
    return new KeyframeEffect(el, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: DURATION_MS, easing: 'ease-out' })
  }
  if (oldCoords === undefined || newCoords === undefined) return instant(el)
  const dx = oldCoords.left - newCoords.left
  const dy = oldCoords.top - newCoords.top
  if (dx === 0 && dy === 0) return instant(el)
  return new KeyframeEffect(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: DURATION_MS, easing: 'ease-out' })
}

/**
 * Ref dla listy/`tbody`: dodawane, znikające i przesuwane wiersze animują się (`@formkit/auto-animate`, jedyny
 * importer). Biblioteka ładuje się leniwie po pierwszym malowaniu (nie obciąża LCP); element, który zniknął
 * przed jej załadowaniem, nie dostaje animacji. Pod `prefers-reduced-motion` nie robi nic; zmiana preferencji
 * w locie podmienia ref i odpina animację.
 */
export function useRowAnimation<T extends HTMLElement>(): RefCallback<T> {
  const reduced = useReducedMotion()
  return useCallback<RefCallback<T>>(
    (element) => {
      if (element === null || reduced) return
      let cancelled = false
      let controller: { disable: () => void } | undefined
      void import('@formkit/auto-animate').then(({ default: autoAnimate }) => {
        if (!cancelled) controller = autoAnimate(element, rowPlugin)
      })
      return () => {
        cancelled = true
        controller?.disable()
      }
    },
    [reduced]
  )
}
