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

export type TimePresentation = {
  kind: 'fact' | 'forecast' | 'plan'
  /** Dominant time (ISO): confirmed actualAt, else predictedAt, else plannedAt. Cancelled rows are always 'plan'. */
  at: string
  /** Label next to the dominant time. */
  label: 'Faktycznie' | 'Przew.' | 'Plan'
  /** Small „Plan HH:mm” source (ISO) — always present for fact/forecast (even when equal), `null` when kind is 'plan'. */
  planAt: string | null
  /** „za N min” of the dominant time; `null` for cancelled rows or outside the countdown window. */
  countdown: string | null
}

const LABEL = { fact: 'Faktycznie', forecast: 'Przew.', plan: 'Plan' } as const

/**
 * Co pokazać w kolumnie godziny wiersza PKP (tablica, karta Pulpitu): godzinę użyteczną — fakt, prognozę albo plan —
 * z nazwanym źródłem, plus plan jako małą linię. Zero nowej logiki realizacji: `realizedTime()` (AGENTS.md #2).
 * Odwołany pociąg pokazuje sam plan i nie odlicza.
 */
export function timePresentation(row: RealizationFields & Pick<BoardApiRow, 'plannedAt' | 'status'>, now: number): TimePresentation {
  const realized = row.status === 'cancelled' ? null : realizedTime(row)
  const kind = realized?.kind ?? 'plan'
  return {
    kind,
    at: realized?.at ?? row.plannedAt,
    label: LABEL[kind],
    planAt: realized === null ? null : row.plannedAt,
    countdown: rowCountdown(row, now),
  }
}

/**
 * Wiersz „minął”: plan w przeszłości, chyba że pociąg jeszcze nie wyjechał (`enRoute`/`notStarted` — spóźniony,
 * wciąż go czekamy, patrz `rowAnchorMs` w transform.ts). Tablica go przygasza, karta Pulpitu pomija.
 */
export function isPastRow(row: Pick<BoardApiRow, 'plannedAt' | 'status'>, now: number): boolean {
  return new Date(row.plannedAt).getTime() < now && row.status !== 'enRoute' && row.status !== 'notStarted'
}
