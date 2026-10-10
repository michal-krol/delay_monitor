import { STATUS_TEXT } from './DelayBadge'
import type { BoardApiRow } from '@/hooks/useBoard'
import { formatClockTime } from '@/lib/format'
import { realizedTime, timeNote } from './boardTime'

/**
 * Kolumna godziny wiersza PKP (tablica i karta Pulpitu): plan duży, pod nim fakt/prognoza w kolorze statusu,
 * na końcu `timeNote()`. `withNote={false}` — podpis rysuje wywołujący (karta: na całą szerokość wiersza).
 */
export function TimePair({ row, now, withNote = true }: { row: BoardApiRow; now: number; withNote?: boolean }) {
  const realized = realizedTime(row)
  const note = withNote ? timeNote(row, now) : null

  return (
    <span className="block tabular-nums">
      {/* PLAN -- zawsze, niezależnie od tego, co wiemy o realizacji. */}
      <span className="block text-base font-semibold text-foreground">{formatClockTime(row.plannedAt)}</span>
      {realized !== null && (
        <span
          className={`block text-sm font-medium ${realized.kind === 'forecast' ? 'italic' : ''}`}
          style={{ color: STATUS_TEXT[row.status] }}
          title={realized.kind === 'forecast' ? 'Godzina przewidywana — przystanek nie jest jeszcze potwierdzony.' : 'Godzina faktyczna — przejazd potwierdzony.'}
        >
          {formatClockTime(realized.at)}
        </span>
      )}
      {note !== null && <span className="block text-xs font-semibold whitespace-normal text-text-secondary">{note}</span>}
    </span>
  )
}

/** Adres szczegółów połączenia (tablica, karta Pulpitu). `encodeURIComponent`, nie `URLSearchParams` (spacja → `+`). */
export function connectionHref(row: Pick<BoardApiRow, 'scheduleId' | 'orderId' | 'operatingDate' | 'trainLabel'>): string {
  return `/connection/${row.scheduleId}/${row.orderId}/${row.operatingDate}?train=${encodeURIComponent(row.trainLabel)}`
}
