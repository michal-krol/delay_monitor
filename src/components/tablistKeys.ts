import type { KeyboardEvent } from 'react'

/**
 * Klawiatura listy zakładek wg wzorca WAI-ARIA (tabs, automatyczna aktywacja): strzałki
 * w lewo/prawo (z zawijaniem), Home i End przenoszą zaznaczenie ORAZ fokus. Podpinane jako
 * `onKeyDown` elementu `role="tablist"`; zakładki to jego potomkowie `role="tab"` w kolejności
 * DOM, a wywołujący daje im roving `tabIndex` (0 aktywna, -1 reszta). Wspólne dla FullBoard
 * i TransitStopDetail.
 */
export function onTablistKeyDown(event: KeyboardEvent<HTMLElement>, activeIndex: number, select: (index: number) => void): void {
  // Alt+strzałka = Wstecz/Dalej przeglądarki itp. — nie przechwytujemy skrótów.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
  const last = tabs.length - 1
  const target =
    event.key === 'ArrowRight'
      ? activeIndex >= last ? 0 : activeIndex + 1
      : event.key === 'ArrowLeft'
        ? activeIndex <= 0 ? last : activeIndex - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (target === null || last < 0) return
  event.preventDefault()
  select(target)
  tabs[target].focus()
}
