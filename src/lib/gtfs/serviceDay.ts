import { serviceDateWindow } from '@/lib/pkp/time'

/**
 * Indeks „dziś" w `serviceDates` ([wczoraj, dziś, jutro] z rozkładu), liczony
 * strefowo przez `serviceDateWindow` — nigdy z `new Date()` procesu (#1).
 * `null`, gdy dzisiejsza data kursowania nie występuje w rozkładzie (feed
 * przestał być odświeżany) — dawniej city-stats i board zgadywały wtedy
 * wczoraj/indeks 1, co jest kłamstwem, nie „dziś" (#7: unknown ≠ zero).
 */
export function todayServiceIndex(serviceDates: string[], timezone: string, now: Date): number | null {
  const today = serviceDateWindow(now, timezone)[1]
  const index = serviceDates.indexOf(today)
  return index === -1 ? null : index
}
