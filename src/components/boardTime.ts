import type { BoardApiRow } from '@/hooks/useBoard'

type RealizationFields = Pick<BoardApiRow, 'actualAt' | 'delayMinutes' | 'predictedAt'>

/**
 * Druga linia w kolumnie godziny — FAKT albo PROGNOZA, nigdy jedno udające
 * drugie (makieta §19).
 *
 * Kolejność jest istotna: potwierdzony czas rzeczywisty wypiera przewidywanie.
 * `actualAt` bez `delayMinutes` to kopia planu, którą PKP wpisuje przed odjazdem
 * (AGENTS.md #2) — nie fakt. `null` znaczy „nie wiemy nic ponad plan”.
 */
export function realizedTime(row: RealizationFields): { at: string; kind: 'fact' | 'forecast' } | null {
  if (row.actualAt !== null && row.delayMinutes !== null) return { at: row.actualAt, kind: 'fact' }
  if (row.predictedAt != null) return { at: row.predictedAt, kind: 'forecast' }
  return null
}

/** Godzina, do której odliczamy („za N min”): fakt, prognoza, a bez nich plan. Zero nowej logiki opóźnień. */
export function expectedAt(row: RealizationFields & Pick<BoardApiRow, 'plannedAt'>): string {
  return realizedTime(row)?.at ?? row.plannedAt
}
