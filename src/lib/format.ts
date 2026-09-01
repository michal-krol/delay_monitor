/**
 * Formatowanie godziny „HH:MM" (pl-PL) z ISO stringa. Powtarzało się w czterech
 * miejscach (`BoardTable`, `ConnectionDetails`, `NetworkStatsCard`,
 * `BoardRowList` — tam jako wstawka).
 *
 * Strefa: przeglądarki (bez `timeZone`), tak jak wszystkie cztery kopie przed
 * scaleniem. `StationAside` ma osobne `formatWarsawTime` z jawnym
 * `Europe/Warsaw` — świadomie inne, do godzin, których nie chcemy przesuwać
 * strefą widza (wschód/zachód słońca). Ewentualne wymuszenie Warsaw tutaj to
 * osobna decyzja (zmiana zachowania dla widzów spoza PL).
 *
 * Przeciążenie: `string` na wejściu -> zawsze `string`; `string | null` ->
 * `string | null`. Dzięki temu wołający z gwarantowanym czasem nie musi
 * koalescować, a `ConnectionDetails` (czasy bywają `null`) dostaje `null`.
 */
export function formatClockTime(iso: string): string
export function formatClockTime(iso: string | null): string | null
export function formatClockTime(iso: string | null): string | null {
  if (iso === null) return null
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}
