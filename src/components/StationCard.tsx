'use client'

import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardRowList } from './BoardRowList'
import { pluralPl } from '@/lib/plural'
import type { StationOption } from './StationSearch'
import type { BoardApiSnapshot } from '@/hooks/useBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { CSSProperties } from 'react'
import type { RealizationStatus } from '@/lib/board/realization'

type Props = {
  stationId: string
  stationName: string
  snapshot: BoardApiSnapshot | null
  error: boolean
  configError: boolean
  onExpand: (station: StationOption) => void
  onRemove: () => void
}

// Kolor obwódki/poświaty karty wg statusu najbliższego odjazdu (decyzja #11
// w globals.css — `glow-ring` czyta `--glow-color` z inline style).
const GLOW_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.16)',
  delayed: 'rgba(234,88,12,0.2)',
  cancelled: 'rgba(225,29,72,0.2)',
  enRoute: 'rgba(79,70,229,0.16)',
  notStarted: 'rgba(2,132,199,0.14)',
  unknown: 'rgba(51,65,85,0.1)',
}
const BORDER_COLOR: Record<RealizationStatus, string> = {
  onTime: 'rgba(22,163,74,0.4)',
  delayed: 'rgba(234,88,12,0.45)',
  cancelled: 'rgba(225,29,72,0.45)',
  enRoute: 'rgba(79,70,229,0.4)',
  notStarted: 'rgba(2,132,199,0.35)',
  unknown: 'var(--surface-border)',
}
// Tryplet "r,g,b" tej samej barwy co GLOW_COLOR/BORDER_COLOR (bez alfy) —
// zasila dekorację w tle karty (tor + wyblakły pociąg), żeby obwódka,
// poświata i dekoracja trzymały spójny odcień, zamiast czterech niezależnie
// dobranych kolorów dla tego samego statusu.
const DECOR_RGB: Record<RealizationStatus, string> = {
  onTime: '22,163,74',
  delayed: '234,88,12',
  cancelled: '225,29,72',
  enRoute: '79,70,229',
  notStarted: '2,132,199',
  unknown: '51,65,85',
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
          style={{ background: `rgba(${DECOR_RGB[leadStatus]},0.3)` }}
        />
        <svg width="200" height="150" viewBox="0 0 200 150" className="absolute -right-4 -bottom-3">
          <line x1="4" y1="120" x2="112" y2="72" stroke={`rgba(${DECOR_RGB[leadStatus]},0.26)`} strokeWidth="3" strokeLinecap="round" />
          <line x1="20" y1="130" x2="122" y2="86" stroke={`rgba(${DECOR_RGB[leadStatus]},0.16)`} strokeWidth="3" strokeLinecap="round" />
          <line x1="38" y1="139" x2="132" y2="100" stroke={`rgba(${DECOR_RGB[leadStatus]},0.09)`} strokeWidth="3" strokeLinecap="round" />
          <g transform="translate(80,4) scale(4.4)" fill="none" stroke={`rgba(${DECOR_RGB[leadStatus]},0.65)`} strokeWidth="0.35" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6.5" />
            <rect x="4.3" y="12.5" width="11.4" height="2.4" rx="1.2" />
            <circle cx="7.3" cy="9" r="1" fill={`rgba(${DECOR_RGB[leadStatus]},0.65)`} stroke="none" />
            <circle cx="12.7" cy="9" r="1" fill={`rgba(${DECOR_RGB[leadStatus]},0.65)`} stroke="none" />
            <path d="M6.3 15.8 4.6 18M13.7 15.8l1.7 2.2" />
          </g>
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{stationName}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {delayedCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {delayedCount} {pluralPl(delayedCount, 'opóźniony', 'opóźnione', 'opóźnionych')}
            </span>
          )}
          {/* Gwiazdka ulubionej stacji z makiety — dekoracyjna (karta na Pulpicie
              to z definicji ulubiona stacja), więc aria-hidden zamiast dublować
              informację, którą czytnik ekranu już ma z samego umieszczenia karty. */}
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="#facc15" stroke="#facc15" strokeWidth="1" strokeLinejoin="round" className="shrink-0">
            <path d="m10 3 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.2l-4.4 2.4.9-4.9L2.9 8.2l4.9-.7z" />
          </svg>
          {/* z-10 stawia przycisk nad nakładką rozwijającą tablicę, która
              w drzewie stoi później i domyślnie przykryłaby go w całości.
              Domyślnie niewidoczny (mockup nie eksponuje usuwania na karcie) —
              pojawia się na hover/focus karty, żeby nie konkurował z gwiazdką. */}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Usuń z ulubionych: ${stationName}`}
            className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-muted opacity-0 transition hover:bg-black/5 hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:opacity-100 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <p aria-live="polite" className="mt-1 text-xs text-red-600 dark:text-red-400">
          Błąd pobierania danych
        </p>
      )}

      <BoardRowList
        rows={departures}
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
