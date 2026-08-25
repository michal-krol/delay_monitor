import { DelayBadge } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import type { BoardApiRow } from '@/hooks/useBoard'

type Props = {
  rows: BoardApiRow[]
  loading: boolean
  /** `true` tylko, gdy jest już snapshot bez wierszy — odróżnia "pusto" od "błąd bez danych" (patrz StationCard). */
  showEmpty: boolean
  emptyMessage: string
}

/** Wydzielone z `StationCard` — ten sam wiersz połączenia używany też przez `FocusedStation`. */
export function BoardRowList({ rows, loading, showEmpty, emptyMessage }: Props) {
  return (
    <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
      {loading && <li className="py-2 text-sm text-gray-500 dark:text-gray-400">Ładowanie…</li>}
      {showEmpty && <li className="py-2 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</li>}
      {rows.map((row) => (
        <li key={`${row.trainNumber}-${row.plannedAt}`} className="py-2 text-sm first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
              <CarrierLogo carrierCode={row.carrier} size={16} />
              {/* Kafelek jest ciasny nawet na desktopie (siatka do 3 kolumn) — pełna
                  nazwa prawna przewoźnika ("«PKP Intercity» Spółka Akcyjna") jest tu
                  zawsze za długa i nieczytelna. Sam skrót, bez przełączania breakpointem. */}
              <span className="truncate">{row.carrier || 'Nieznany przewoźnik'}</span>
            </span>
            <DelayBadge status={row.status} delayMinutes={row.delayMinutes} estimatedDelayMinutes={row.estimatedDelayMinutes} />
          </div>
          <div className="mt-0.5 text-gray-500 dark:text-gray-400">
            <span className="tabular-nums">
              {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
            </span>{' '}
            · {row.trainLabel} → {row.headsign ?? '—'} · <span>Peron/Tor: {row.platform ?? '—'}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
