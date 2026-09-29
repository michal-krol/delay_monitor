'use client'

import { useEffect, useState, type RefCallback } from 'react'

/**
 * `tabIndex` dla regionu z `overflow-auto`: `0` tylko wtedy, gdy treść faktycznie się
 * w nim przewija. Region przewijalny musi dać się sfokusować z klawiatury (axe
 * `scrollable-region-focusable`, WCAG 2.1.1), ale stały `tabIndex={0}` to zbędny
 * przystanek Tab tam, gdzie nic się nie przewija (np. prawa kolumna pod treścią na telefonie).
 *
 * Obserwujemy region ORAZ jego dzieci: gdy region ma już maksymalną wysokość (`max-h-*`),
 * rosnąca treść nie zmienia jego rozmiaru, więc sam region nie dostałby zdarzenia.
 * Bez `ResizeObserver` zostaje dawne zachowanie (zawsze fokusowalny).
 */
export function useScrollableFocus<T extends HTMLElement>(): [RefCallback<T>, 0 | undefined] {
  const [element, setElement] = useState<T | null>(null)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    if (element === null) return
    if (typeof ResizeObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- brak API do obserwacji: bezpieczny stan domyślny
      setScrollable(true)
      return
    }
    const check = (): void =>
      setScrollable(element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
    const resize = new ResizeObserver(check)
    const observeAll = (): void => {
      resize.disconnect()
      resize.observe(element)
      for (const child of element.children) resize.observe(child)
    }
    observeAll()
    // Nowe dzieci (np. karta dochodzi po wczytaniu danych) też trzeba obserwować.
    const mutation = new MutationObserver(observeAll)
    mutation.observe(element, { childList: true })
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [element])

  return [setElement, scrollable ? 0 : undefined]
}
