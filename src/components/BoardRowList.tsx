import Link from 'next/link'
import { CarrierLogo } from './CarrierLogo'
import { DelayBadge } from './DelayBadge'
import { AlertCircleIcon, ICON_SIZE } from './icons'
import { TimePair, connectionHref } from './TimePair'
import { useRowAnimation } from '@/hooks/useRowAnimation'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'
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

/** Treść wiersza: ta sama kolumna godziny co tablica (`TimePair`), kierunek główny, status przy kursie. */
function RowBody({ row, now }: { row: BoardApiRow; now: number }) {
  return (
    // Powiększony tekst układa dane pionowo; status dostaje kolumnę dopiero w szerokiej karcie.
    <span className="grid grid-cols-1 @min-[16rem]:grid-cols-[auto_minmax(0,1fr)] @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3">
      <span className="@min-[30rem]:row-span-2">
        <TimePair row={row} now={now} compact plannedPrimary />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere] font-medium text-foreground">{row.headsign ?? '—'}</span>
      <span className="min-w-0 @min-[16rem]:col-span-2 @min-[30rem]:col-span-1 @min-[30rem]:text-right">
        <DelayBadge
          status={row.status}
          delayMinutes={row.delayMinutes}
          estimatedDelayMinutes={row.estimatedDelayMinutes}
          predictedDelayMinutes={row.predictedDelayMinutes ?? null}
        />
      </span>
      {/* Sam skrót przewoźnika (na prośbę usera): pełna nazwa prawna jest na karcie zawsze za długa. */}
      <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-text-muted @min-[16rem]:col-span-2 @min-[30rem]:col-start-2">
        <span className="mr-1 inline-block align-[-2px]">
          <CarrierLogo carrierCode={row.carrier} size={ICON_SIZE.chip} />
        </span>
        {row.carrier || 'Nieznany przewoźnik'} · {row.trainLabel} · {row.platform !== null ? `peron ${row.platform}` : 'peron —'}
        {row.hasDisruption === true && (
          <span className="ml-1 text-warning-text">
            <AlertCircleIcon size={ICON_SIZE.inline} label="Utrudnienie na trasie" className="inline align-[-2px]" />
          </span>
        )}
      </span>
    </span>
  )
}

/** Skrócona lista połączeń na karcie Pulpitu; wiersz z datą kursowania linkuje do szczegółów połączenia. */
export function BoardRowList({ rows, now, loading, showEmpty, emptyMessage }: Props) {
  const listRef = useRowAnimation<HTMLUListElement>()
  return (
    <ul ref={listRef} className="mt-3 grid divide-y divide-surface-border @min-[48rem]:grid-cols-3 @min-[48rem]:divide-x @min-[48rem]:divide-y-0 @min-[48rem]:gap-4">
      {loading && (
        <>
          <li className="sr-only">Wczytywanie…</li>
          {[0, 1].map((i) => (
            <li key={i} data-testid="skeleton-row" aria-hidden="true" className="my-2 h-14 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
          ))}
        </>
      )}
      {showEmpty && <li className="py-2 text-sm text-text-muted">{emptyMessage}</li>}
      {rows.map((row) => (
        <li key={`${row.trainNumber}-${row.plannedAt}`} className="@container min-w-0 text-sm">
          {/* Bez daty kursowania `/api/train` odrzuci zapytanie — wiersz zostaje tekstem (jak na tablicy). */}
          {row.operatingDate !== '' ? (
            <Link
              href={connectionHref(row)}
              transitionTypes={NAV_FORWARD_TYPES}
              className="-mx-2 block rounded-lg px-2 py-2.5 transition hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/[0.06]"
            >
              <RowBody row={row} now={now} />
            </Link>
          ) : (
            <div className="py-2.5">
              <RowBody row={row} now={now} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
