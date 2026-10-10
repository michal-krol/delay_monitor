'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useCities } from '@/hooks/useCities'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import { TransitDepartureList } from './TransitDepartureList'
import { stopsWithLines } from './stopName'
import { PlaceTitle } from './PlaceTitle'
import { CARD_ROWS } from './StationCard'
import { ChevronRightIcon, ICON_SIZE } from './icons'
import { NAV_FORWARD_TYPES } from '@/lib/navTransition'

type Props = {
  city: string
  stopId: string
  stopName: string
  /** Przypięty jeden przystanek zespołu (`stopName` ma już numer, „Centrum 02"); brak = cały zespół. */
  member?: boolean
  /**
   * Stary wpis zespołu zapisany pod id przystanku (deep-link, pin z mapy sprzed flagi `member`):
   * po wczytaniu tablicy zgłasza prawdziwe id zespołu, żeby Pulpit przepisał wpis i gwiazdka na
   * stronie zespołu się zgadzała. Nie dotyczy przypiętego pojedynczego przystanku (`member`).
   */
  onGroupResolved?: (groupId: string) => void
}

/**
 * Odpowiednik `StationCard` na Pulpicie dla przypiętego przystanku miejskiego.
 * Świadomie mówi „rozkład" i nie ma kolumny statusu — komunikacja miejska nie
 * ma opóźnień. Każda karta odpytuje swój przystanek osobno (GTFS nie ma limitu
 * zapytań; Pulpit trzyma kilka przypięć, nie kilkadziesiąt).
 */
export function TransitStopCard({ city, stopId, stopName, member = false, onGroupResolved }: Props) {
  const { data, loading, failed } = useTransitBoard(city, [stopId], CARD_ROWS, member ? stopId : null)
  // Ten sam wspólny hook `/api/cities` co `WeatherChip`/`TransitStopDetail`/
  // strona miasta (Task 9).
  const { cities: cityEntries } = useCities()
  const cityName = cityEntries.find((entry) => entry.id === city)?.name ?? city
  const board = data?.stops[0] ?? null
  const groupId = board?.groupId ?? null
  useEffect(() => {
    if (!member && groupId !== null && groupId !== stopId) onGroupResolved?.(groupId)
  }, [member, groupId, stopId, onGroupResolved])
  // Odliczanie „za N min” tyka z odpytywaniem (30 s), bez zegara na kartę.
  const now = useSnapshotNow(data)
  // Zespół: nazwa z rozkładu (aktualna). Jeden przystanek: zapisana nazwa z numerem —
  // `board.name` to goła nazwa zespołu, która znaczyłaby „cały zespół".
  const name = member ? stopName : (board?.name ?? stopName)
  // Link zawsze na stronę zespołu; wybrany przystanek przez `?przystanek=`. Stary wpis
  // z `id` przystanku bez flagi nie otwiera już zawężonego widoku zamiast zespołu.
  const groupPath = `/city/${city}/stop/${encodeStopIdForPathSegment(board?.groupId ?? stopId)}`
  const href = member ? `${groupPath}?przystanek=${encodeURIComponent(stopId)}` : groupPath

  // Nagłówek i wiersze to osobne, prawdziwe linki — żadnej nakładki na całą kartę (zagnieżdżone cele dotyku).
  const title = (
    <h2 className="text-lg font-semibold tracking-tight text-foreground">
      <Link
        href={href}
        transitionTypes={NAV_FORWARD_TYPES}
        data-card-open
        className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
      >
        <span className="min-w-0 truncate">{name}</span>
        <ChevronRightIcon size={ICON_SIZE.button} className="shrink-0 text-text-muted" />
      </Link>
    </h2>
  )

  return (
    <article className="glass card-press w-full rounded-2xl border border-surface-border p-5 max-sm:p-4">
      {/* Nazwę przejścia ma tylko kafelek zespołu: przypięty pojedynczy przystanek tej samej grupy dałby duplikat
          `view-transition-name`, który przerywa całe przejście. */}
      {member ? title : <PlaceTitle kind="gtfs" id={`${city}:${board?.groupId ?? stopId}`}>{title}</PlaceTitle>}

      <p className="text-xs text-text-muted">Rozkład — {cityName}</p>

      {failed ? (
        <p className="mt-3 text-sm text-error-text">Nie udało się pobrać rozkładu.</p>
      ) : (
        <TransitDepartureList
          departures={board?.departures ?? []}
          loading={loading}
          now={now}
          city={city}
          variant="card"
          skeletonRows={CARD_ROWS}
          // Numer tylko w zespole z kilkoma przystankami — w jednoprzystankowym nic nie rozróżnia.
          showStopCode={!member && stopsWithLines(board?.members).length > 1}
        />
      )}
    </article>
  )
}
