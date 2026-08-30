/**
 * Jedyne miejsce logiki dopasowania utrudnień do pociągów/przystanków i
 * dekodowania ich treści — używane zarówno przez tablicę (`board/transform.ts`)
 * jak i panel szczegółów połączenia (`board/trainDetail.ts`). Ten sam duch co
 * `realization.ts`: dwie niezależne implementacje tej samej logiki już raz się
 * rozjechały w tym projekcie, nie powtarzaj tego dla innej domeny.
 */
import type { DisruptionAffectedRoute, RawDisruption } from '../pkp/types'

/**
 * `scheduleId` sam w sobie to w praktyce stała "rok" (zweryfikowane na
 * żywych danych) — dopasowanie musi używać pełnej trójki razem z `orderId`
 * i `operatingDate`, dokładnie ten sam klucz kompozytowy co `BoardRow`/`/api/train`.
 */
export function disruptionTrainKey(scheduleId: string, orderId: string, operatingDate: string): string {
  return `${scheduleId}-${orderId}-${operatingDate}`
}

/**
 * Na żywych danych (36 rekordów, 2026-08-26) `message` bywa dwojaki: krótki
 * klucz słownikowy (np. "utr_40") ALBO już w pełni wyrenderowany tekst przez
 * samo PKP, który nie pasuje do żadnego klucza w `disruptionTypes` — żaden
 * rekord nie miał niewypełnionego `{placeholder}`. `?? message` pokrywa oba
 * kształty poprawnie, bez prób ręcznego wypełniania placeholderów (patrz
 * `findStopDisruptionMessages` niżej -- jedno `disruptionId` bywa rozrzucone
 * po odległych, niepowiązanych stacjach, więc nie ma jednego spójnego
 * "początku/końca" do wypełnienia).
 */
export function decodeDisruptionMessage(message: string | null, disruptionTypes: Record<string, string>): string | null {
  if (message === null) return null
  return disruptionTypes[message] ?? message
}

function matchesRoute(route: DisruptionAffectedRoute, scheduleId: string, orderId: string, operatingDate: string, stationId: string): boolean {
  return route.scheduleId === scheduleId && route.orderId === orderId && route.operatingDate === operatingDate && route.stationId === stationId
}

/** Zbiór przejazdów dotkniętych jakimkolwiek utrudnieniem, bez względu na stację -- źródło badge'a na tablicy (`BoardRow.hasDisruption`). */
export function indexDisruptedTrains(disruptions: RawDisruption[]): ReadonlySet<string> {
  const trains = new Set<string>()
  for (const disruption of disruptions) {
    for (const route of disruption.affectedRoutes) {
      trains.add(disruptionTrainKey(route.scheduleId, route.orderId, route.operatingDate))
    }
  }
  return trains
}

/**
 * Zdekodowane treści utrudnień obejmujących KONKRETNY przystanek KONKRETNEGO
 * przejazdu -- źródło wskaźnika + przycisku w panelu szczegółów połączenia.
 * Dedup po `disruptionId`: dwie trasy tego samego utrudnienia przechodzące
 * przez ten sam przystanek nie mają duplikować tekstu.
 */
export function findStopDisruptionMessages(
  disruptions: RawDisruption[],
  disruptionTypes: Record<string, string>,
  scheduleId: string,
  orderId: string,
  operatingDate: string,
  stationId: string
): string[] {
  const seen = new Set<number>()
  const messages: string[] = []
  for (const disruption of disruptions) {
    if (seen.has(disruption.disruptionId)) continue
    const matches = disruption.affectedRoutes.some((route) => matchesRoute(route, scheduleId, orderId, operatingDate, stationId))
    if (!matches) continue
    seen.add(disruption.disruptionId)
    const text = decodeDisruptionMessage(disruption.message, disruptionTypes)
    if (text !== null) messages.push(text)
  }
  return messages
}

/**
 * Zdekodowane treści utrudnień dotykających DANEJ STACJI — dowolnego
 * przejazdu przez nią, w odróżnieniu od `findStopDisruptionMessages()`, które
 * pyta o konkretny przejazd na konkretnym przystanku. Źródło modułu
 * „Utrudnienia" w prawej kolumnie widoku stacji.
 *
 * Dedup po `disruptionId`, tak samo jak wyżej: jedno utrudnienie obejmujące
 * czterdzieści pociągów przez tę stację to jeden komunikat, nie czterdzieści.
 */
export function findStationDisruptionMessages(
  disruptions: RawDisruption[],
  disruptionTypes: Record<string, string>,
  stationId: string
): string[] {
  const seen = new Set<number>()
  const messages: string[] = []
  for (const disruption of disruptions) {
    if (seen.has(disruption.disruptionId)) continue
    if (!disruption.affectedRoutes.some((route) => route.stationId === stationId)) continue
    seen.add(disruption.disruptionId)
    const text = decodeDisruptionMessage(disruption.message, disruptionTypes)
    if (text !== null) messages.push(text)
  }
  return messages
}
