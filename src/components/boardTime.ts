import type { BoardApiRow } from '@/hooks/useBoard'
import { countdownLabel } from '@/lib/countdown'

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

/** „za N min” wiersza tablicy PKP (tablica, Pulpit); odwołany pociąg nigdy nie odlicza. */
export function rowCountdown(row: RealizationFields & Pick<BoardApiRow, 'plannedAt' | 'status'>, now: number): string | null {
  return row.status === 'cancelled' ? null : countdownLabel(now, expectedAt(row))
}

/**
 * Podpis pod godzinami wiersza tablicy: „Prognoza · za 7 min”, „Prognoza”, „za 7 min” albo `null`.
 * Prognoza nazwana wprost, żeby nie udawała faktu; faktu nie podpisujemy — mówi o nim plakietka statusu.
 */
export function timeNote(row: RealizationFields & Pick<BoardApiRow, 'plannedAt' | 'status'>, now: number): string | null {
  if (row.status === 'cancelled') return null
  const parts = [realizedTime(row)?.kind === 'forecast' ? 'Prognoza' : null, rowCountdown(row, now)].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Wiersz „minął”: plan w przeszłości, chyba że pociąg jeszcze nie wyjechał (`enRoute`/`notStarted` — spóźniony,
 * wciąż go czekamy, patrz `rowAnchorMs` w transform.ts). Tablica go przygasza, karta Pulpitu pomija.
 */
export function isPastRow(row: Pick<BoardApiRow, 'plannedAt' | 'status'>, now: number): boolean {
  return new Date(row.plannedAt).getTime() < now && row.status !== 'enRoute' && row.status !== 'notStarted'
}
