'use client'

import Link from 'next/link'
import { AllDeparturesLink } from './AllDeparturesLink'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardRowList } from './BoardRowList'
import { isPastRow } from './boardTime'
import { PlaceTitle } from './PlaceTitle'
import { ModeTile } from './transitMode'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { formatDataTimestamp } from '@/lib/dataTimestamp'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'

/** Ile kursów pokazuje karta Pulpitu — reszta jest na tablicy stacji. */
export const CARD_ROWS = 3

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
}

export function StationCard({ stationId, stationName, snapshot, error, configError }: Props) {
  const now = useSnapshotNow(snapshot)

  // Kafelek dashboardu pokazuje tylko nadchodzące połączenia — pociągi, które
  // już odjechały (mieszczące się w oknie 5 minut wstecz z transform.ts),
  // zostają wyłącznie w pełnej tablicy (FullBoard), gdzie są przygaszone.
  // Spóźniony, który jeszcze nie wyjechał, zostaje — ta sama reguła co na tablicy.
  const departures = (snapshot?.departures.filter((row) => !isPastRow(row, now)) ?? []).slice(0, CARD_ROWS)

  if (configError) {
    return <ConfigErrorBanner />
  }

  const href = `/station/${stationId}?name=${encodeURIComponent(stationName)}`

  // Nagłówek, wiersze i „Wszystkie odjazdy” to osobne, prawdziwe linki — żadnej nakładki na całą kartę (zagnieżdżone cele dotyku).
  return (
    <article className="glass card-press @container min-w-0 w-full rounded-2xl border border-surface-border p-5 max-sm:p-3">
      <div className="flex items-start gap-3">
        <ModeTile modes={['rail']} />
        <div className="min-w-0 flex-1">
          <PlaceTitle kind="pkp" id={stationId}>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              <Link
                href={href}
                transitionTypes={NAV_FORWARD_TYPES}
                data-card-open
                className="-mx-1 flex min-h-11 items-center rounded-lg px-1 [overflow-wrap:anywhere] hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
              >
                {stationName}
              </Link>
            </h2>
          </PlaceTitle>
          <p className="text-xs text-text-muted">Stacja kolejowa PKP</p>
        </div>
      </div>

      {error && !snapshot && (
        <p aria-live="polite" className="mt-1 text-xs text-error-text">
          Nie udało się pobrać danych
        </p>
      )}
      {error && snapshot && (
        // Odświeżenie padło, ale ostatni dobry snapshot wciąż jest ważny —
        // czerwony błąd kłamałby, że dane zniknęły (#7: rosnący wiek danych,
        // nie pusty ekran).
        <p aria-live="polite" className="mt-1 text-xs text-text-muted">
          Nie udało się odświeżyć · dane z {formatDataTimestamp(snapshot.fetchedAt)}
        </p>
      )}

      <BoardRowList
        rows={departures}
        now={now}
        loading={!snapshot && !error}
        showEmpty={snapshot !== null && departures.length === 0}
        emptyMessage="Brak odjazdów w najbliższych godzinach"
      />

      <AllDeparturesLink href={href} name={stationName} />
    </article>
  )
}
