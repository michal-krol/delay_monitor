'use client'

/**
 * Historyczny mechanizm stanu widoku w URL-u, sprzed przejścia na
 * `next/navigation` (decyzja #4 w redesignie dashboardu — prawdziwe trasy
 * zamiast jednej strony ze stanem `expanded`). Użycie na trasie `/`
 * (`?station=&name=` w starym `src/app/page.tsx`) zniknęło razem z tamtym
 * plikiem. `FullBoard.tsx` wciąż importuje `readUrlParam`/`patchUrlParams`,
 * ale już tylko dla jednego parametru (`?tab=`) — szczegóły połączenia mają
 * od dawna własną trasę (`/polaczenie/...`), więc `scheduleId`/`orderId`/
 * `operatingDate` nie przechodzą już przez ten moduł.
 *
 * Do usunięcia, gdy `FullBoard.tsx` przejdzie na `useSearchParams`/`useRouter`
 * bezpośrednio dla `tab` (wzorem `?focus=` w `src/app/(app)/page.tsx`) —
 * osobna, świadoma zmiana, nie przy okazji drobnych porządków.
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
