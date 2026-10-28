import { STATUS_TEXT } from './DelayBadge'
import type { BoardApiRow } from '@/hooks/useBoard'
import { formatClockTime } from '@/lib/format'
import { timePresentation } from './boardTime'

/**
 * Kolumna godziny wiersza PKP (tablica i karta Pulpitu): godzina użyteczna (fakt / prognoza / plan) duża, z nazwanym
 * źródłem, pod nią „Plan HH:mm · za N min”. Kolor statusu tylko przy fakcie i prognozie — o znaczeniu mówi podpis,
 * nigdy sam kolor. `plannedPrimary` jawnie zmienia tylko karty Startu: plan duży, fakt/prognoza poniżej.
 */
export function TimePair({ row, now, compact = false, plannedPrimary = false }: { row: BoardApiRow; now: number; compact?: boolean; plannedPrimary?: boolean }) {
  const { kind, at, label, planAt, countdown } = timePresentation(row, now)
  const below = [plannedPrimary ? (kind !== 'plan' ? `${label} ${formatClockTime(at)}` : null) : (planAt !== null ? `Plan ${formatClockTime(planAt)}` : null), countdown].filter((part) => part !== null).join(' · ')

  return (
    <span className="block tabular-nums">
      <span className="flex items-baseline gap-1.5">
        <span
          className={`${compact ? 'text-base font-semibold' : 'time-dominant'} ${kind === 'plan' || plannedPrimary ? 'text-foreground' : ''}`}
          style={kind === 'plan' || plannedPrimary ? undefined : { color: STATUS_TEXT[row.status] }}
        >
          {formatClockTime(plannedPrimary ? row.plannedAt : at)}
        </span>
        <span className="text-xs font-semibold text-text-secondary">{plannedPrimary ? 'Plan' : label === 'Przew.' ? <abbr title="Przewidywana">Przew.</abbr> : label}</span>
      </span>
      {below !== '' && <span className="block text-sm whitespace-normal text-text-muted">{below}</span>}
    </span>
  )
}

/** Adres szczegółów połączenia (tablica, karta Pulpitu). `encodeURIComponent`, nie `URLSearchParams` (spacja → `+`). */
export function connectionHref(row: Pick<BoardApiRow, 'scheduleId' | 'orderId' | 'operatingDate' | 'trainLabel'>): string {
  return `/connection/${row.scheduleId}/${row.orderId}/${row.operatingDate}?train=${encodeURIComponent(row.trainLabel)}`
}
