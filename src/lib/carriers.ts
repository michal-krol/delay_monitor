/**
 * Kod przewoźnika → ścieżka do logo. Wyłącznie logotypy — pełna nazwa
 * przewoźnika pochodzi teraz ze słownika `dictionaries.carriers` dołączonego
 * do każdej odpowiedzi `/api/v1/schedules` (patrz `BoardRow.carrierName` w
 * `board/transform.ts`), więc nie trzeba jej już zgadywać ani utrzymywać tutaj.
 *
 * Kody poniżej są potwierdzone na żywym słowniku (nie zgadywane) — zob.
 * `/api/v1/dictionaries/carriers`. Logo ma tylko część przewoźników; dla
 * pozostałych UI pokazuje samą nazwę ze słownika, bez ikony.
 */
const CARRIER_LOGOS: Record<string, string> = {
  IC: '/carriers/pkp-ic.svg',
  KM: '/carriers/km.svg',
  SKM: '/carriers/skm.svg',
  ŁKA: '/carriers/lka.svg',
  'Leo Express': '/carriers/leo-express.svg',
  LEO: '/carriers/leo-express.svg',
  PR: '/carriers/pr.svg',
}

export function getCarrierLogo(code: string): string | undefined {
  return CARRIER_LOGOS[code]
}
