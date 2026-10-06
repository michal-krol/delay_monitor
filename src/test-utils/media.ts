import { vi } from 'vitest'

/**
 * Atrapa `matchMedia` (jsdom jej nie ma, a bez niej `useMediaQuery` bierze wartość „serwerową”).
 * `matches: false` = telefon (poniżej `sm`). Sprzątanie: `vi.unstubAllGlobals()` w `afterEach`.
 */
export function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }))
}
