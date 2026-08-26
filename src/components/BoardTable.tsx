'use client'

import { useRouter } from 'next/navigation'
import { DelayBadge } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import { ChevronRightIcon } from './icons'
import type { Direction } from './FullBoard'
import type { BoardApiRow } from '@/hooks/useBoard'
import type { RealizationStatus } from '@/lib/board/realization'

// Delikatne podbarwienie wiersza dla statusów wymagających uwagi — z makiety
// (`FullBoard.dc.html`). Niezależne od `--status-*-bg` (te są zastrzeżone
// wyłącznie dla `DelayBadge`, patrz decyzja #8 w globals.css) — to osobna,
// dużo bardziej przezroczysta warstwa czysto dekoracyjna.
const ROW_TINT: Partial<Record<RealizationStatus, string>> = {
  delayed: 'rgba(234,88,12,0.05)',
  cancelled: 'rgba(225,29,72,0.05)',
}

type Props = {
  stationName: string
  direction: Direction
  rows: BoardApiRow[]
  now: number
  /** Brak snapshotu jeszcze, nie brak połączeń -- bez tego "Brak odjazdów..." i "Ładowanie…" nad tabelą (BoardStatus) potrafiły się pokazać jednocześnie. */
  loading: boolean
}

/**
 * Tabela wycięta z `FullBoard` — czysto prezentacyjna, nic nie fetchuje.
 * Dzięki temu bezpieczna do zasilenia snapshotem, który wywołujący już ma
 * (np. `Dashboard`'s wspólny `useBoard` dla wszystkich ulubionych), bez
 * ryzyka drugiego, niezależnego zapytania do pollera.
 */
export function BoardTable({ stationName, direction, rows, now, loading }: Props) {
  const router = useRouter()

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          {direction === 'departures' ? 'Odjazdy' : 'Przyjazdy'} — {stationName}
        </caption>
        <thead>
          <tr className="border-b border-black/10 dark:border-white/10">
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Pociąg</th>
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Przewoźnik</th>
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Kierunek</th>
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Planowo</th>
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Peron/Tor</th>
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Status</th>
            <th scope="col" className="py-2 pr-1"><span className="sr-only">Szczegóły</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-text-muted">
                {loading
                  ? 'Ładowanie…'
                  : direction === 'departures'
                    ? 'Brak odjazdów w najbliższych godzinach'
                    : 'Brak przyjazdów w najbliższych godzinach'}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            // Pociąg, którego planowy czas już minął (mieści się w oknie
            // 5 minut wstecz z transform.ts) — cały wiersz wizualnie
            // przygaszony (łącznie z przewoźnikiem i plakietką statusu),
            // żeby odróżnić go od nadchodzących, bez zmiany danych.
            const isPast = new Date(row.plannedAt).getTime() < now
            // operatingDate bywa puste, gdy API nie podało go dla tego
            // przejazdu (patrz board/transform.ts) — bez niego /api/train
            // i tak odrzuci zapytanie, więc wiersz lepiej nie robić klikalnym.
            const canOpenDetails = row.operatingDate !== ''

            function openDetails(): void {
              if (canOpenDetails) {
                // encodeURIComponent, nie URLSearchParams (form-encoding zamieniłoby
                // spacje na `+`) -- ta sama konwencja co /odjazdy/[stationId] w page.tsx.
                router.push(
                  `/polaczenie/${row.scheduleId}/${row.orderId}/${row.operatingDate}?train=${encodeURIComponent(row.trainLabel)}`
                )
              }
            }

            return (
              // Kliknięcie gdziekolwiek w wierszu wygodne dla myszy, ale
              // `<tr role="button">` łamałoby semantykę tabeli (zniknąłby
              // domyślny `role="row"`, na którym opierają się czytniki
              // ekranu i testy). Dostępność klawiaturowa idzie osobno,
              // przez prawdziwy <button> na etykiecie pociągu.
              <tr
                key={`${row.trainNumber}-${row.plannedAt}`}
                data-past={isPast || undefined}
                className={`border-b border-black/5 transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5 ${isPast ? 'opacity-50' : ''} ${canOpenDetails ? 'cursor-pointer' : ''}`}
                style={!isPast ? { backgroundColor: ROW_TINT[row.status] } : undefined}
                onClick={canOpenDetails ? openDetails : undefined}
              >
                <td className="py-2.5 pr-3 whitespace-nowrap text-foreground">
                  {canOpenDetails ? (
                    <button
                      type="button"
                      onClick={openDetails}
                      className="rounded text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {row.trainLabel}
                    </button>
                  ) : (
                    row.trainLabel
                  )}
                  {row.category !== '' && (
                    <span className="ml-1.5 text-xs text-text-muted" title={row.categoryName ?? undefined}>
                      {row.categoryName ?? row.category}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="inline-flex items-center gap-1.5 text-text-secondary">
                    <CarrierLogo carrierCode={row.carrier} size={16} />
                    <span className="sm:hidden">{row.carrier || '—'}</span>
                    <span className="hidden sm:inline">{row.carrierName ?? (row.carrier || '—')}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-text-secondary">{row.headsign ?? '—'}</td>
                {/* tabular-nums: godziny stoją jedna pod drugą, więc cyfry muszą mieć
                    równą szerokość — inaczej kolumna „faluje" i traci się sens tablicy. */}
                <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-text-secondary">
                  {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2.5 pr-3 text-text-secondary">{row.platform ?? '—'}</td>
                <td className="py-2.5 pr-3">
                  <DelayBadge
                    status={row.status}
                    delayMinutes={row.delayMinutes}
                    direction={direction === 'arrivals' ? 'arrival' : 'departure'}
                    estimatedDelayMinutes={row.estimatedDelayMinutes}
                  />
                </td>
                <td className="py-2.5 pr-1 text-text-muted">
                  {canOpenDetails && <ChevronRightIcon size={14} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
