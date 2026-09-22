/** Fokusuje pierwszy element z listy, który faktycznie przyjmie fokus (ukryte/wygaszone go odrzucają). */
function focusFirstThatSticks(candidates: HTMLElement[]): void {
  for (const el of candidates) {
    el.focus()
    if (document.activeElement === el) return
  }
}

/** Prosty focus-trap: Tab poza kontenerem wraca na jego początek/koniec. Wołać z `keydown`. */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || container === null) return
  const focusables = Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
  if (focusables.length === 0) return
  const active = document.activeElement
  const step = event.shiftKey ? [...focusables].reverse() : focusables
  const atEnd = active === step[step.length - 1]
  // Fokus wypadł poza kontener (np. element zniknął przy przebudowie mapy) albo stoi na ostatnim
  // elemencie -- zawiń. Ukryte elementy (np. atrybucja MapLibre w trybie compact) pomija
  // `focusFirstThatSticks`, więc lista nie musi znać widoczności.
  if (!container.contains(active) || atEnd) {
    event.preventDefault()
    focusFirstThatSticks(step)
  }
}
