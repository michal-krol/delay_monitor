export type DisplayNumber = { prefix: string; value: number; suffix: string }

/**
 * Rozbija gotowy napis wskaźnika („+3”, „87%”, „12”) na części liczbowe do animacji. Tylko cyfry stają się
 * liczbą: „brak danych”, „—” i pusty napis zostają tekstem (`null`), więc nieznane nigdy nie wejdzie do
 * animowanego licznika jako `0` (AGENTS.md #7).
 */
export function parseDisplayNumber(text: string): DisplayNumber | null {
  const match = /^(\+?)(\d+)(%?)$/.exec(text)
  return match === null ? null : { prefix: match[1], value: Number(match[2]), suffix: match[3] }
}
