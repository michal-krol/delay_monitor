/** Od ilu przystanków trasa dostaje skrót „Pokaż całą trasę” (≤ tyle = zawsze cała lista). */
export const COLLAPSE_MIN_STOPS = 8

const MIN_ROWS = 3

/**
 * Okno skróconej trasy (indeksy włącznie): od ostatniego POTWIERDZONEGO przystanku (bez potwierdzeń — od kotwicy
 * pozycji) do dwóch za kotwicą, min. 3 wiersze. Zawsze zawiera kotwicę („Pociąg jest tutaj”). `null` = nie skracaj
 * (krótka trasa albo okno obejmuje całość). Czysta funkcja: indeksy dostarczają `resolveCurrentStopIndex` i
 * `resolvePositionAnchor` (trainDetail.ts), tu żadnej logiki realizacji (AGENTS.md #2).
 */
export function collapsedStopRange(input: {
  stopCount: number
  confirmedIndex: number
  anchorIndex: number
}): { from: number; to: number } | null {
  const { stopCount, confirmedIndex, anchorIndex } = input
  if (stopCount <= COLLAPSE_MIN_STOPS) return null

  let from = Math.max(0, confirmedIndex >= 0 ? confirmedIndex : anchorIndex)
  if (anchorIndex >= 0) from = Math.min(from, anchorIndex)
  from = Math.min(from, stopCount - MIN_ROWS)
  const to = Math.min(stopCount - 1, Math.max(Math.max(from, anchorIndex) + 2, from + MIN_ROWS - 1))

  return from === 0 && to === stopCount - 1 ? null : { from, to }
}
