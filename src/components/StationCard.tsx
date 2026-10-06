'use client'

import { ConfigErrorBanner } from './ConfigErrorBanner'
import { IconButton } from './IconButton'
import { StarIcon, TrainIcon, ICON_SIZE } from './icons'
import { BoardRowList } from './BoardRowList'
import { pluralPl } from '@/lib/plural'
import type { StationOption } from './StationSearch'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { formatClockTime } from '@/lib/format'
import type { CSSProperties } from 'react'
import { GLOW_COLOR, BORDER_COLOR, statusTint } from './realizationColors'

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
  onExpand: (station: StationOption) => void
  onRemove: () => void
}

export function StationCard({ stationId, stationName, snapshot, error, configError, onExpand, onRemove }: Props) {
  const now = useSnapshotNow(snapshot)

  // Kafelek dashboardu pokazuje tylko nadchodzące połączenia — pociągi, które
  // już odjechały (mieszczące się w oknie 5 minut wstecz z transform.ts),
  // zostają wyłącznie w pełnej tablicy (FullBoard), gdzie są przygaszone.
  const departures = (snapshot?.departures.filter((row) => new Date(row.plannedAt).getTime() >= now) ?? []).slice(0, 3)
  const delayedCount = snapshot?.departures.filter((row) => row.status === 'delayed').length ?? 0
  const leadStatus = departures[0]?.status ?? 'unknown'

  if (configError) {
    return <ConfigErrorBanner />
  }

  // Cała kafelka jest klikalna, ale przyciskiem jest wyłącznie przezroczysta
  // nakładka. Gdyby <button> obejmował treść, byłby to niepoprawny HTML
  // (przycisk przyjmuje tylko phrasing content), nagłówek zniknąłby z nawigacji
  // po nagłówkach, a czytnik ekranu przeczytałby całą zawartość karty jako
  // nazwę przycisku.
  return (
    <article
      data-status={leadStatus}
      className="glow-ring card-hover group relative isolate w-full overflow-hidden rounded-2xl border p-5 text-left transition duration-200 focus-within:ring-2 focus-within:ring-indigo-500"
      style={
        {
          borderColor: BORDER_COLOR[leadStatus],
          '--glow-color': GLOW_COLOR[leadStatus],
        } as CSSProperties
      }
    >
      {/* Dekoracja z makiety (tor + wyblakły pociąg, poświata w rogu) — czysto
          wizualna, stąd na samym początku drzewa (leży pod resztą treści bez
          z-index) i pointer-events-none, żeby nie przechwytywała kliknięć
          należących do przycisku "pokaż pełną tablicę" niżej. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
        style={{
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, transparent 42%, #000 68%)',
          maskImage: 'linear-gradient(180deg, transparent 0%, transparent 42%, #000 68%)',
        }}
      >
        <div
          className="absolute -right-8 -bottom-8 h-40 w-40 rounded-full blur-[32px]"
          style={{ background: statusTint(leadStatus, 30) }}
        />
        <svg width="200" height="150" viewBox="0 0 200 150" className="absolute -right-4 -bottom-3">
          <line x1="4" y1="120" x2="112" y2="72" style={{ stroke: statusTint(leadStatus, 26) }} strokeWidth="3" strokeLinecap="round" />
          <line x1="20" y1="130" x2="122" y2="86" style={{ stroke: statusTint(leadStatus, 16) }} strokeWidth="3" strokeLinecap="round" />
          <line x1="38" y1="139" x2="132" y2="100" style={{ stroke: statusTint(leadStatus, 9) }} strokeWidth="3" strokeLinecap="round" />
          {/* Ten sam `TrainIcon` (jedno źródło ikon), powiększony do ~88 px; cienki obrys przez CSS `stroke-width` (bije atrybut). */}
          <g transform="translate(80,4) scale(3.667)" style={{ color: statusTint(leadStatus, 65) }}>
            <TrainIcon size={24} className="[stroke-width:0.42]" />
          </g>
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{stationName}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {delayedCount > 0 && (
            /* Ten sam bursztynowy chip co „Utrudnienie" w panelu szczegółów
               (`ConnectionDetails`) — jedno miękkie ostrzeżenie w całej apce,
               nie dwa lekko różne odcienie na ciemnym tle. */
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {delayedCount} {pluralPl(delayedCount, 'opóźniony', 'opóźnione', 'opóźnionych')}
            </span>
          )}
          {/* Odpięcie tą samą pełną gwiazdką co na stronie stacji (PR 7b): przypięte =
              pełna, klik odpina. z-10 stawia przycisk nad nakładką rozwijającą tablicę,
              która w drzewie stoi później i domyślnie przykryłaby go w całości. */}
          <IconButton label={`Odepnij z Pulpitu: ${stationName}`} onClick={onRemove} className="z-10">
            <StarIcon size={ICON_SIZE.button} filled />
          </IconButton>
        </div>
      </div>

      {error && !snapshot && (
        <p aria-live="polite" className="mt-1 text-xs text-error-text">
          Błąd pobierania danych
        </p>
      )}
      {error && snapshot && (
        // Odświeżenie padło, ale ostatni dobry snapshot wciąż jest ważny —
        // czerwony błąd kłamałby, że dane zniknęły (#7: rosnący wiek danych,
        // nie pusty ekran).
        <p aria-live="polite" className="mt-1 text-xs text-text-muted">
          Nie udało się odświeżyć · dane z {formatClockTime(snapshot.fetchedAt)}
        </p>
      )}

      <BoardRowList
        rows={departures}
        now={now}
        loading={!snapshot && !error}
        showEmpty={snapshot !== null && departures.length === 0}
        emptyMessage="Brak odjazdów w najbliższych godzinach"
      />

      <button
        type="button"
        onClick={() => onExpand({ id: stationId, name: stationName })}
        aria-label={`Pokaż pełną tablicę: ${stationName}`}
        className="absolute inset-0 rounded-2xl focus:outline-none"
      />
    </article>
  )
}
