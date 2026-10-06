import { DelayBadge } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import { AlertCircleIcon, ArrowRightIcon, ICON_SIZE } from './icons'
import { formatClockTime } from '@/lib/format'
import { rowCountdown } from './boardTime'
import type { BoardApiRow } from '@/hooks/useBoard'

type Props = {
  rows: BoardApiRow[]
  /** „Teraz” z ostatniego snapshotu (`useSnapshotNow`) — odliczanie tyka z odpytywaniem, bez własnego zegara. */
  now: number
  loading: boolean
  /** `true` tylko, gdy jest już snapshot bez wierszy — odróżnia "pusto" od "błąd bez danych" (patrz StationCard). */
  showEmpty: boolean
  emptyMessage: string
}

/** Wydzielone ze `StationCard` — skrócona lista połączeń na kafelku Pulpitu. */
export function BoardRowList({ rows, now, loading, showEmpty, emptyMessage }: Props) {
  return (
    <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
      {loading && <li className="py-2 text-sm text-text-muted">Wczytywanie…</li>}
      {showEmpty && <li className="py-2 text-sm text-text-muted">{emptyMessage}</li>}
      {rows.map((row) => {
        const countdown = rowCountdown(row, now)
        return (
        <li key={`${row.trainNumber}-${row.plannedAt}`} className="py-2 text-sm first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-text-secondary">
              <CarrierLogo carrierCode={row.carrier} size={ICON_SIZE.button} />
              {/* Kafelek jest ciasny nawet na desktopie (siatka do 3 kolumn) — pełna
                  nazwa prawna przewoźnika ("«PKP Intercity» Spółka Akcyjna") jest tu
                  zawsze za długa i nieczytelna. Sam skrót, bez przełączania breakpointem. */}
              <span className="truncate">{row.carrier || 'Nieznany przewoźnik'}</span>
            </span>
            <DelayBadge status={row.status} delayMinutes={row.delayMinutes} estimatedDelayMinutes={row.estimatedDelayMinutes} />
          </div>
          <div className="mt-0.5 text-text-muted">
            <span className="tabular-nums">{formatClockTime(row.plannedAt)}</span>{' '}
            {countdown !== null && <span className="font-semibold text-text-secondary">· {countdown} </span>}
            · {row.trainLabel}{' '}
            {row.hasDisruption === true && (
              <span className="text-warning-text">
                <AlertCircleIcon size={ICON_SIZE.inline} label="Utrudnienie na trasie" className="inline align-[-2px]" />
              </span>
            )}{' '}
            <ArrowRightIcon size={ICON_SIZE.inline} label="do" className="inline align-[-2px]" /> {row.headsign ?? '—'} ·{' '}
            <span>Peron/Tor: {row.platform ?? '—'}</span>
          </div>
        </li>
        )
      })}
    </ul>
  )
}
