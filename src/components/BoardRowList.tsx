import Link from 'next/link'
import { DelayBadge } from './DelayBadge'
import { AlertCircleIcon, ICON_SIZE } from './icons'
import { timeNote } from './boardTime'
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
  const note = timeNote(row, now)
  return (
    // Metadane pod kierunkiem biorą też szerokość statusu — długa plakietka („jeszcze nie wyjechał”) ucinała peron.
    <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3">
      <span className="row-span-2">
        <TimePair row={row} now={now} withNote={false} />
      </span>
      <span className="min-w-0 truncate font-medium text-foreground">{row.headsign ?? '—'}</span>
      <span className="text-right">
        <DelayBadge
          status={row.status}
          delayMinutes={row.delayMinutes}
          estimatedDelayMinutes={row.estimatedDelayMinutes}
          predictedDelayMinutes={row.predictedDelayMinutes ?? null}
        />
      </span>
      <span className="col-span-2 min-w-0 truncate text-xs text-text-muted">
        {row.trainLabel} · {row.platform !== null ? `peron ${row.platform}` : 'peron: nie podano'}
        {row.hasDisruption === true && (
          <span className="ml-1 text-warning-text">
            <AlertCircleIcon size={ICON_SIZE.inline} label="Utrudnienie na trasie" className="inline align-[-2px]" />
          </span>
        )}
      </span>
      {note !== null && <span className="col-span-3 mt-0.5 text-xs font-semibold text-text-secondary tabular-nums">{note}</span>}
    </span>
  )
}

/** Skrócona lista połączeń na karcie Pulpitu; wiersz z datą kursowania linkuje do szczegółów połączenia. */
export function BoardRowList({ rows, now, loading, showEmpty, emptyMessage }: Props) {
  const listRef = useRowAnimation<HTMLUListElement>()
  return (
    <ul ref={listRef} className="mt-3 divide-y divide-surface-border">
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
        <li key={`${row.trainNumber}-${row.plannedAt}`} className="text-sm">
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
