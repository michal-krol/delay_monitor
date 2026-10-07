const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Silnik Chromium (Chrome, Edge, Samsung Internet) ma `navigator.userAgentData`; Safari i Firefox nie. Powód
 * zawężenia: w buildzie WebKit użytym przez Playwright `document.startViewTransition` wieszał stronę przy KAŻDEJ
 * nawigacji, a prawdziwego iPhone'a jeszcze nie sprawdzono — Safari dostaje stronę bez przejść. Odblokowanie
 * po click-QA na urządzeniu (`.claude/rules/ui-motion.md`).
 */
function viewTransitionsAllowed(): boolean {
  return 'userAgentData' in navigator && !window.matchMedia(REDUCED_MOTION).matches
}

let installed = false

/**
 * Zasłania `document.startViewTransition` akcesorem, który zwraca funkcję tylko tam, gdzie przejścia są dozwolone
 * (silnik Chromium, brak `prefers-reduced-motion`; preferencja jest czytana przy każdym dostępie, więc zmiana w locie
 * działa bez przeładowania). Gdzie niedozwolone, React widzi „brak API” i nawiguje bez przejścia.
 *
 * Dlaczego tak, a nie przez właściwości `<ViewTransition>`: React woła `startViewTransition` także wtedy, gdy wszystkie
 * animacje są `'none'` (potwierdzone), a montowanie/odmontowywanie `ViewTransition` zależnie od silnika zmieniałoby
 * kształt drzewa po hydracji (ponowne montowanie strony). Tu drzewo jest zawsze to samo.
 *
 * Zachowuje funkcję zastaną na `document` (np. rejestrator w testach e2e) — opakowuje ją, nie prototypową natywną.
 */
export function installViewTransitionGate(): void {
  if (installed || typeof document === 'undefined') return
  const current = document.startViewTransition
  if (typeof current !== 'function') return
  installed = true
  const bound = current.bind(document)
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    get: () => (viewTransitionsAllowed() ? bound : undefined),
  })
}

/** Tylko dla testów: pozwala zainstalować bramkę ponownie na świeżym `document`. */
export function resetViewTransitionGateForTests(): void {
  installed = false
}
