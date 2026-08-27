'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { DelayBadge, LABELS, TOKENS } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import { AlertCircleIcon, ChevronRightIcon, HelpCircleIcon } from './icons'
import type { Direction } from './FullBoard'
import type { BoardApiRow } from '@/hooks/useBoard'
import type { RealizationStatus } from '@/lib/board/realization'

/** Opisy dla legendy statusów -- zweryfikowane wprost w `resolveStopStatus()` (`lib/board/realization.ts`), nie zgadywane. */
const STATUS_DESCRIPTIONS: Record<RealizationStatus, string> = {
  onTime: 'Przyjazd/odjazd potwierdzony, bez opóźnienia.',
  delayed: 'Przyjazd/odjazd potwierdzony, z opóźnieniem od 1 minuty.',
  cancelled: 'Ten przystanek został odwołany.',
  unknown: 'Przystanek potwierdzony, ale nie da się wyliczyć opóźnienia.',
  notStarted: 'Przystanek jeszcze niepotwierdzony, a pociąg jako całość jeszcze nie ruszył.',
  enRoute: 'Przystanek jeszcze niepotwierdzony, ale pociąg już wyjechał z wcześniejszego miejsca na trasie.',
}

/** Kolejność wpisów w legendzie -- ta sama co w `resolveStopStatus()`, nie kolejność zależna od `Object.keys`. */
const STATUS_ORDER: RealizationStatus[] = ['onTime', 'delayed', 'cancelled', 'unknown', 'notStarted', 'enRoute']

function StatusLegend() {
  // Prawdziwy stan (nie czysty CSS :hover), żeby panel istniał w DOM
  // wyłącznie gdy otwarty -- inaczej etykiety statusów w legendzie
  // (identyczne z tekstem plakietek na wierszach, celowo -- jedno źródło
  // prawdziwy `LABELS`) kolidowałyby z zapytaniami `getByText` na wierszach.
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)

  function show(): void {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  return (
    <span ref={anchorRef} className="relative ml-1 inline-flex" onMouseEnter={show} onMouseLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)}>
      <button type="button" aria-label="Legenda statusów" className="cursor-help text-text-muted">
        <HelpCircleIcon size={13} />
      </button>
      {/* Portal do <body> -- rodzic tabeli ma `overflow-x-auto`, co wymusza
          (spec. CSS Overflow) `overflow-y: auto` na tym samym elemencie i
          obcina wszystko, co z niego wystaje, gdy tabela jest krótka (mało
          wierszy). `position: fixed` liczone z getBoundingClientRect() w
          show() całkowicie omija to ograniczenie, zamiast próbować zgadywać
          z-index/stacking w obrębie tabeli. */}
      {open && position !== null && createPortal(
        <span
          role="tooltip"
          // Celowo w pełni kryjące (nie `glass`/`glass-strong`, obie to zawsze
          // tylko 88%/75% krycia z blurem) -- to pływający panel nad
          // dowolną, ruchliwą zawartością tabeli, nie karta w kompozycji
          // strony, więc musi być czytelny niezależnie od tła pod spodem.
          className="fixed z-50 w-64 rounded-2xl border border-black/10 bg-white p-3 text-xs text-text-secondary dark:border-white/10 dark:bg-slate-900"
          style={{ top: position.top, right: position.right, boxShadow: 'var(--surface-shadow), 0 0 24px rgba(99,102,241,0.28)' }}
        >
          <ul className="flex flex-col gap-2">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex gap-2">
                <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: TOKENS[status].bg }} />
                <span>
                  {/* text-foreground, nie text-text-primary -- ten drugi nie
                      odpowiada żadnemu zdefiniowanemu tokenowi w globals.css
                      (ten sam rodzaj błędu co wcześniejsze bg-background),
                      więc dziedziczył stonowany text-secondary zamiast się
                      wyróżnić. */}
                  <span className="font-semibold text-foreground">
                    {status === 'notStarted' ? 'jeszcze nie wyjechał / nie przyjechał' : LABELS[status]}
                  </span>
                  <br />
                  {STATUS_DESCRIPTIONS[status]}
                </span>
              </li>
            ))}
          </ul>
        </span>,
        document.body
      )}
    </span>
  )
}

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
            <th scope="col" className="py-2 pr-3 font-medium text-text-muted">
              Status
              <StatusLegend />
            </th>
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
                  <span className="inline-flex items-center gap-1">
                    {row.hasDisruption === true && (
                      <span title="Utrudnienie na trasie" className="text-amber-600 dark:text-amber-400">
                        <AlertCircleIcon size={14} />
                      </span>
                    )}
                    {canOpenDetails && <ChevronRightIcon size={14} />}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
