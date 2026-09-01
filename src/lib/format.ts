/**
 * Formatowanie godziny „HH:MM" z ISO stringa, **zawsze w strefie warszawskiej**
 * niezależnie od strefy widza. To tablica PKP — godzina odjazdu ma być
 * warszawska, nawet gdy stronę ogląda ktoś z innej strefy czasowej. `AGENTS.md`
 * #1: godziny z `/schedules` czytamy jako warszawskie; wyświetlanie musi być
 * spójne.
 *
 * Scala pięć wcześniejszych kopii: `BoardTable`, `ConnectionDetails`,
 * `NetworkStatsCard`, wstawka w `BoardRowList` (te renderowały w strefie
 * widza — zmiana zachowania dla widzów spoza PL) oraz `formatWarsawTime`
 * w `StationAside` (już z jawnym `Europe/Warsaw`).
 *
 * Przeciążenie: `string` na wejściu -> zawsze `string`; `string | null` ->
 * `string | null`. Dzięki temu wołający z gwarantowanym czasem nie musi
 * koalescować, a `ConnectionDetails` (czasy bywają `null`) dostaje `null`.
 */
export function formatClockTime(iso: string): string
export function formatClockTime(iso: string | null): string | null
export function formatClockTime(iso: string | null): string | null {
  if (iso === null) return null
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}
