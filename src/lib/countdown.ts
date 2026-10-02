import { formatDuration } from './format'

/**
 * Ile pełnych minut (zaokrąglonych) zostało do chwili `atMs`; ujemne = już minęła.
 * Jedyna implementacja odliczania (tablica PKP, Pulpit, przystanek). Wejście to
 * znormalizowane chwile (ISO z offsetem, AGENTS.md #1), więc strefa przeglądarki nie gra roli.
 */
export function minutesUntil(nowMs: number, atMs: number): number {
  return Math.round((atMs - nowMs) / 60_000)
}

/**
 * „za N min” albo `null`: poniżej minuty (nigdy „za 0 min”), w przeszłości (nigdy ujemne,
 * wzorem `ConnectionDetails.tsx`) i od `maxMinutes` w górę — wiersze odliczają tylko w obrębie
 * godziny; wyróżniony najbliższy odjazd przystanku podaje `Infinity` („za 2 h 5 min”).
 */
export function countdownLabel(nowMs: number, atIso: string, maxMinutes = 60): string | null {
  const minutes = minutesUntil(nowMs, new Date(atIso).getTime())
  if (minutes < 1 || minutes >= maxMinutes) return null
  return `za ${formatDuration(minutes)}`
}
