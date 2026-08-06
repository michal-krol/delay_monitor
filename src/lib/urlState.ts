'use client'

/**
 * Stan widoku w adresie URL — bez `next/navigation`. Appka ma jedną trasę i
 * nic po stronie serwera nie zależy od parametrów zapytania, więc pełny router
 * Next byłby nieuzasadnioną zależnością (i wymagałby mockowania go w testach,
 * których dziś nie ma). `history.replaceState`, nie `pushState`: zwykłe
 * klikanie po appce nie ma zaśmiecać historii cofania przeglądarki — URL
 * odzwierciedla *aktualny* widok, nie każdy krok do niego.
 */

/** `null`, gdy wywołane poza przeglądarką (SSR) — parametry URL nie istnieją, dopóki nie ma `window`. */
export function readUrlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

/**
 * Ustawia/usuwa (wartość `null`) podane parametry, zachowując resztę zapytania
 * nietkniętą — `page.tsx` i `FullBoard.tsx` piszą do tego samego URL-a
 * niezależnie (stacja vs zakładka/połączenie), więc żaden z nich nie może
 * budować query string od zera.
 */
export function patchUrlParams(patch: Record<string, string | null>): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }

  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`
  window.history.replaceState(null, '', url)
}
