'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { DelayBadge, LABELS, STATUS_TEXT, TOKENS } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import { CategoryBadge } from './CategoryBadge'
import { AlertCircleIcon, ChevronRightIcon, HelpCircleIcon } from './icons'
import type { Direction } from './FullBoard'
import type { BoardApiRow } from '@/hooks/useBoard'
import type { RealizationStatus } from '@/lib/board/realization'
import { formatClockTime } from '@/lib/format'

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
  const tooltipId = useId()

  function show(): void {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  return (
    <span
      ref={anchorRef}
      className="relative ml-1 inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      // Escape zamyka podpowiedź bez zabierania focusu z przycisku -- zachowanie
      // tooltipa (nie dialogu). Focus zostaje, więc `onFocus` nie otworzy jej
      // z powrotem, dopóki użytkownik nie odejdzie i nie wróci.
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button type="button" aria-label="Legenda statusów" aria-describedby={open ? tooltipId : undefined} className="cursor-help text-text-muted">
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
          id={tooltipId}
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

/**
 * Ile wierszy widać, zanim użytkownik kliknie „Pokaż więcej połączeń".
 * Snapshot niesie ich więcej (okno 3 h / 40 wierszy, patrz `transform.ts`) —
 * rozwinięcie jest czysto klienckie i nie kosztuje ani jednego zapytania.
 */
const COLLAPSED_ROWS = 10

/** Stabilny klucz wiersza -- ten sam przejazd między snapshotami. */
function rowKey(row: BoardApiRow): string {
  return `${row.trainNumber}-${row.plannedAt}`
}

/**
 * Wiersze, w których opóźnienie zmieniło się względem POPRZEDNIEGO snapshotu
 * — źródło błysku tła (makieta §22: „+3 min → +4 min powinno zostać
 * zasygnalizowane subtelną animacją zamiast pełnego przeładowania tabeli").
 *
 * Porównanie żyje w `useRef` aktualizowanym w efekcie, nie w trakcie
 * renderowania: React potrafi wyrenderować ten sam stan dwa razy (Strict
 * Mode), a porównanie „w locie" zapamiętałoby wtedy nową wartość przy
 * pierwszym przebiegu i przy drugim nie wykryłoby już żadnej zmiany.
 *
 * Pierwszy snapshot nigdy nie miga — wtedy wszystko jest „nowe", a migająca
 * cała tablica nie niosłaby żadnej informacji.
 */
function useChangedDelays(rows: BoardApiRow[]): ReadonlySet<string> {
  const previous = useRef<Map<string, number | null> | null>(null)
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const current = new Map(rows.map((row) => [rowKey(row), row.delayMinutes]))
    const before = previous.current
    previous.current = current

    if (before === null) return

    const next = new Set<string>()
    for (const [key, delay] of current) {
      if (before.has(key) && before.get(key) !== delay) next.add(key)
    }
    setChanged(next)
  }, [rows])

  return changed
}


/**
 * Druga linia w kolumnie godziny — FAKT albo PROGNOZA, nigdy jedno udające
 * drugie (makieta §19).
 *
 * Kolejność jest istotna: potwierdzony czas rzeczywisty wypiera przewidywanie.
 * `null` znaczy „nie wiemy nic ponad plan" i wtedy druga linia po prostu nie
 * istnieje — pusty wiersz jest uczciwszy niż powtórzony plan udający pomiar.
 */
function realizedTime(row: BoardApiRow): { time: string; kind: 'fact' | 'forecast' } | null {
  if (row.actualAt !== null && row.delayMinutes !== null) return { time: formatClockTime(row.actualAt), kind: 'fact' }
  if (row.predictedAt != null) return { time: formatClockTime(row.predictedAt), kind: 'forecast' }
  return null
}

/** „przez Pruszków, Opoczno · +12 przystanków" — pusto, gdy nie znamy trasy. */
function viaLabel(row: BoardApiRow): string | null {
  const via = row.via ?? []
  const remaining = row.viaRemaining ?? 0
  if (via.length === 0) return null
  const base = `przez ${via.join(', ')}`
  return remaining > 0 ? `${base} · +${remaining} ${remaining === 1 ? 'przystanek' : 'przystanków'}` : base
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
  const [expanded, setExpanded] = useState(false)
  const changedDelays = useChangedDelays(rows)

  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const hiddenCount = rows.length - visibleRows.length

  function openDetails(row: BoardApiRow): void {
    // encodeURIComponent, nie URLSearchParams (form-encoding zamieniłoby
    // spacje na `+`) -- ta sama konwencja co /odjazdy/[stationId] w page.tsx.
    router.push(`/polaczenie/${row.scheduleId}/${row.orderId}/${row.operatingDate}?train=${encodeURIComponent(row.trainLabel)}`)
  }

  const emptyMessage = loading
    ? 'Ładowanie…'
    : direction === 'departures'
      ? 'Brak odjazdów w najbliższych godzinach'
      : 'Brak przyjazdów w najbliższych godzinach'

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="board-table w-full text-left text-sm">
          <caption className="sr-only">
            {direction === 'departures' ? 'Odjazdy' : 'Przyjazdy'} — {stationName}
          </caption>
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              {/* `aria-label` na każdym nagłówku dwuwierszowym: bez niego nazwa
                  dostępna powstaje ze sklejenia obu linii BEZ spacji
                  („Perontor"), bo `block` nie wprowadza odstępu do drzewa
                  dostępności. Widoczny podpis zostaje, nazwa jest zdaniem. */}
              <th scope="col" aria-label={direction === 'departures' ? 'Odjazd — plan i faktycznie' : 'Przyjazd — plan i faktycznie'} className="py-2 pr-3 pl-3 font-medium text-text-muted">
                {direction === 'departures' ? 'Odjazd' : 'Przyjazd'}
                <span className="block text-[11px] font-normal">plan · faktycznie</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Pociąg</th>
              <th scope="col" aria-label="Kierunek i przystanki pośrednie" className="py-2 pr-3 font-medium text-text-muted">
                Kierunek
                <span className="block text-[11px] font-normal">przez</span>
              </th>
              <th scope="col" aria-label="Peron i tor" className="py-2 pr-3 font-medium text-text-muted">
                Peron
                <span className="block text-[11px] font-normal">tor</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-medium text-text-muted">
                Status
                <StatusLegend />
              </th>
              <th scope="col" className="py-2 pr-1"><span className="sr-only">Szczegóły</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <BoardRow
                key={rowKey(row)}
                row={row}
                direction={direction}
                now={now}
                onOpen={openDetails}
                delayChanged={changedDelays.has(rowKey(row))}
              />
            ))}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            Pokaż więcej połączeń
            <span className="text-text-muted">({hiddenCount})</span>
          </button>
        </div>
      )}
    </div>
  )
}

type RowProps = {
  row: BoardApiRow
  direction: Direction
  now: number
  onOpen: (row: BoardApiRow) => void
  /** Opóźnienie zmieniło się w tym odświeżeniu — wiersz raz błyska (patrz `useChangedDelays`). */
  delayChanged: boolean
}

/** Pasek akcentu po lewej stronie wiersza (makieta §12) -- pozwala skanować listę wzrokiem bez czytania wartości. */
function accentColor(status: RealizationStatus): string {
  return TOKENS[status].bg
}

/** Peron i tor, każde ze swoim własnym „nie podano" (makieta §10). */
function PlatformTrack({ row }: { row: BoardApiRow }) {
  const platform = row.platform
  const track = row.track ?? null

  if (platform === null && track === null) {
    // „Nie podano" to nie to samo co „—" przy znanym peronie i nieznanym torze
    // -- rozróżnienie wprost wymagane przez makietę §10.
    return <span className="text-xs text-text-muted">nie podano</span>
  }

  return (
    <span className="block tabular-nums">
      <span className="block font-semibold text-foreground">{platform ?? '—'}</span>
      <span className="block text-xs text-text-muted">{track ?? '—'}</span>
    </span>
  )
}

function TrainIdentity({ row }: { row: BoardApiRow }) {
  return (
    <span className="flex items-center gap-2">
      <CategoryBadge category={row.category} categoryName={row.categoryName} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-foreground">{row.trainLabel}</span>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <CarrierLogo carrierCode={row.carrier} size={12} />
          <span className="truncate">{row.carrierName ?? (row.carrier || '—')}</span>
        </span>
      </span>
    </span>
  )
}

function TimePair({ row }: { row: BoardApiRow }) {
  const realized = realizedTime(row)

  return (
    <span className="block tabular-nums">
      {/* PLAN -- zawsze, niezależnie od tego, co wiemy o realizacji. */}
      <span className="block text-base font-semibold text-foreground">{formatClockTime(row.plannedAt)}</span>
      {realized !== null && (
        <span
          className={`block text-sm font-medium ${realized.kind === 'forecast' ? 'italic' : ''}`}
          style={{ color: STATUS_TEXT[row.status] }}
          title={realized.kind === 'forecast' ? 'Godzina przewidywana — przystanek nie jest jeszcze potwierdzony.' : 'Godzina faktyczna — przejazd potwierdzony.'}
        >
          {realized.time}
        </span>
      )}
    </span>
  )
}

function BoardRow({ row, direction, now, onOpen, delayChanged }: RowProps) {
  // Pociąg, którego planowy czas już minął (mieści się w oknie
  // 5 minut wstecz z transform.ts) — cały wiersz wizualnie
  // przygaszony (łącznie z przewoźnikiem i plakietką statusu),
  // żeby odróżnić go od nadchodzących, bez zmiany danych.
  const isPast = new Date(row.plannedAt).getTime() < now
  // operatingDate bywa puste, gdy API nie podało go dla tego
  // przejazdu (patrz board/transform.ts) — bez niego /api/train
  // i tak odrzuci zapytanie, więc wiersz lepiej nie robić klikalnym.
  const canOpenDetails = row.operatingDate !== ''
  const via = viaLabel(row)

  return (
    // Kliknięcie gdziekolwiek w wierszu wygodne dla myszy, ale
    // `<tr role="button">` łamałoby semantykę tabeli (zniknąłby
    // domyślny `role="row"`, na którym opierają się czytniki
    // ekranu i testy). Dostępność klawiaturowa idzie osobno,
    // przez prawdziwy <button> na etykiecie pociągu.
    <tr
      data-past={isPast || undefined}
      className={`group border-b border-black/5 transition dark:border-white/5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${isPast ? 'opacity-50' : ''} ${canOpenDetails ? 'cursor-pointer' : ''} ${delayChanged ? 'delay-changed' : ''}`}
      // borderLeftColor działa wyłącznie w układzie kartowym (poniżej `sm`,
      // patrz `.board-table` w globals.css) -- na desktopie wiersz nie ma
      // ramki, a akcent rysuje `inset box-shadow` na komórce godziny.
      style={{ borderLeftColor: accentColor(row.status), ...(!isPast ? { backgroundColor: ROW_TINT[row.status] } : {}) }}
      onClick={canOpenDetails ? () => onOpen(row) : undefined}
    >
      <td data-cell="time" className="py-2.5 pr-3 pl-3 whitespace-nowrap" style={{ boxShadow: `inset 3px 0 0 0 ${accentColor(row.status)}` }}>
        <TimePair row={row} />
      </td>
      <td data-cell="train" className="max-w-[13rem] py-2.5 pr-3">
        {canOpenDetails ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(row)
            }}
            // Jawna etykieta, bo treść przycisku to teraz trzy rzeczy naraz
            // (plakietka kategorii, numer, przewoźnik) -- bez tego czytnik
            // ekranu odczytałby „EIC EIC 1 PKP Intercity" zamiast nazwy pociągu.
            aria-label={row.trainLabel}
            className="rounded text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <TrainIdentity row={row} />
          </button>
        ) : (
          <TrainIdentity row={row} />
        )}
      </td>
      <td data-cell="direction" className="max-w-[18rem] py-2.5 pr-3">
        <span className="block truncate font-medium text-foreground">{row.headsign ?? '—'}</span>
        {via !== null && <span className="block truncate text-xs text-text-muted">{via}</span>}
      </td>
      <td data-cell="platform" className="py-2.5 pr-3">
        <PlatformTrack row={row} />
      </td>
      <td data-cell="status" className="py-2.5 pr-3">
        <DelayBadge
          status={row.status}
          delayMinutes={row.delayMinutes}
          direction={direction === 'arrivals' ? 'arrival' : 'departure'}
          estimatedDelayMinutes={row.estimatedDelayMinutes}
          predictedDelayMinutes={row.predictedDelayMinutes ?? null}
        />
      </td>
      <td data-cell="chevron" className="py-2.5 pr-1 text-text-muted">
        <span className="inline-flex items-center gap-1">
          {row.hasDisruption === true && (
            <span title="Utrudnienie na trasie" className="text-amber-600 dark:text-amber-400">
              <AlertCircleIcon size={14} />
            </span>
          )}
          {canOpenDetails && (
            <span className="transition group-hover:translate-x-0.5 group-hover:text-foreground">
              <ChevronRightIcon size={14} />
            </span>
          )}
        </span>
      </td>
    </tr>
  )
}
