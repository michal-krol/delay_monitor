'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DelayBadge, LABELS, STATUS_TEXT, TOKENS } from './DelayBadge'
import { CarrierLogo } from './CarrierLogo'
import { CategoryBadge } from './CategoryBadge'
import { InfoTooltip } from './InfoTooltip'
import { statusTint } from './realizationColors'
import { AlertCircleIcon, ChevronRightIcon, ICON_SIZE } from './icons'
import type { Direction } from './FullBoard'
import type { BoardApiRow } from '@/hooks/useBoard'
import type { RealizationStatus } from '@/lib/board/realization'
import { formatClockTime } from '@/lib/format'
import { realizedTime, rowCountdown } from './boardTime'

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

/** Legenda statusów („?”) — przy zakładkach Odjazdy/Przyjazdy (`FullBoard`), bo nagłówek tabeli na telefonie jest ukryty. */
export function StatusLegend() {
  return (
    <InfoTooltip label="Legenda statusów">
      <ul className="flex flex-col gap-2">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="flex gap-2">
            <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: TOKENS[status].bg }} aria-hidden="true" />
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
    </InfoTooltip>
  )
}

// Delikatne podbarwienie wiersza dla statusów wymagających uwagi — z makiety
// (`FullBoard.dc.html`): ten sam token co plakietka, rozcieńczony do 5 %.
const ROW_TINT: Partial<Record<RealizationStatus, string>> = {
  delayed: statusTint('delayed', 5),
  cancelled: statusTint('cancelled', 5),
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
  /** Brak snapshotu jeszcze, nie brak połączeń -- bez tego "Brak odjazdów..." i "Wczytywanie…" nad tabelą (BoardStatus) potrafiły się pokazać jednocześnie. */
  loading: boolean
}

/**
 * Tabela wycięta z `FullBoard` — czysto prezentacyjna, nic nie fetchuje.
 * Dzięki temu bezpieczna do zasilenia snapshotem, który wywołujący już ma
 * (np. `Dashboard`'s wspólny `useBoard` dla wszystkich przypiętych), bez
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
    // spacje na `+`) -- ta sama konwencja co /station/[stationId] w page.tsx.
    router.push(`/connection/${row.scheduleId}/${row.orderId}/${row.operatingDate}?train=${encodeURIComponent(row.trainLabel)}`)
  }

  const emptyMessage = direction === 'departures' ? 'Brak odjazdów w najbliższych godzinach' : 'Brak przyjazdów w najbliższych godzinach'

  return (
    <div className="mt-3 @container">
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
                <span className="block text-xs font-normal">plan · faktycznie</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Pociąg</th>
              <th scope="col" aria-label="Kierunek i przystanki pośrednie" className="py-2 pr-3 font-medium text-text-muted">
                Kierunek
                <span className="block text-xs font-normal">przez</span>
              </th>
              <th scope="col" aria-label="Peron i tor" className="py-2 pr-3 font-medium text-text-muted">
                Peron
                <span className="block text-xs font-normal">tor</span>
              </th>
              <th scope="col" className="py-2 pr-3 font-medium text-text-muted">
                Status
              </th>
              <th scope="col" className="py-2 pr-1"><span className="sr-only">Szczegóły</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && loading && (
              <>
                <tr>
                  <td colSpan={6} className="sr-only">
                    Wczytywanie…
                  </td>
                </tr>
                {[0, 1, 2].map((i) => (
                  <tr key={i} data-testid="skeleton-row" aria-hidden="true">
                    <td colSpan={6} className="py-2">
                      <div className="h-12 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
                    </td>
                  </tr>
                ))}
              </>
            )}
            {visibleRows.length === 0 && !loading && (
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
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
        <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
          <CarrierLogo carrierCode={row.carrier} size={ICON_SIZE.chip} />
          <span className="min-w-0 truncate">{row.carrierName ?? (row.carrier || '—')}</span>
        </span>
      </span>
    </span>
  )
}

function TimePair({ row, now }: { row: BoardApiRow; now: number }) {
  const realized = realizedTime(row)
  const countdown = rowCountdown(row, now)

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
          {formatClockTime(realized.at)}
        </span>
      )}
      {countdown !== null && <span className="block text-xs font-semibold text-text-secondary">{countdown}</span>}
    </span>
  )
}

function BoardRow({ row, direction, now, onOpen, delayChanged }: RowProps) {
  // Pociąg, którego planowy czas już minął — cały wiersz wizualnie
  // przygaszony (łącznie z przewoźnikiem i plakietką statusu), żeby
  // odróżnić go od nadchodzących, bez zmiany danych. Wyjątek: pociąg
  // jeszcze nieodjeżdżający (`enRoute`/`notStarted`) nie jest „miniony"
  // mimo planu w przeszłości — jest opóźniony i wciąż go czekamy
  // (patrz `rowAnchorMs` w transform.ts) — pełne krycie.
  const isPast =
    new Date(row.plannedAt).getTime() < now && row.status !== 'enRoute' && row.status !== 'notStarted'
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
        <TimePair row={row} now={now} />
      </td>
      {/* `truncate` nie kurczy komórki (min-content = pełna nazwa przewoźnika), więc w wąskiej tabeli
          (kontener < 42rem, np. FullBoard przy oknie 1280 px) limit jest niższy — inaczej tabela 600 px
          przewijała się w karcie 565 px. Tylko w trybie tabeli (`sm:`): karta na telefonie ma własną siatkę. */}
      <td data-cell="train" className="max-w-[13rem] py-2.5 pr-3 sm:@max-2xl:max-w-[10rem]">
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
            className="block max-w-full rounded text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <TrainIdentity row={row} />
          </button>
        ) : (
          <TrainIdentity row={row} />
        )}
      </td>
      {/* Ta sama pułapka co wyżej, ale bez stałego limitu: „przez Warszawa Wschodnia, Wołomin, Tłuszcz
          · +15 przystanków" rozpychało kolumnę do pełnych 18rem i tabela przewijała się przy 1280 px
          (QA 2026-10-01). `w-full max-w-0` (tylko tryb tabeli): komórka nie wnosi min-content, a
          kolumna bierze miejsce, które zostaje po pozostałych — `truncate` skraca do niego tekst.
          Pozostałe kolumny dostają przez to tylko min-content, stąd `@2xl:whitespace-nowrap` na
          peronie i statusie: w szerokiej tabeli bez łamania („jeszcze nie wyjechał"), w wąskiej jak dawniej. */}
      <td data-cell="direction" className="py-2.5 pr-3 sm:w-full sm:max-w-0">
        <span className="block truncate font-medium text-foreground">{row.headsign ?? '—'}</span>
        {via !== null && <span className="block truncate text-xs text-text-muted">{via}</span>}
      </td>
      <td data-cell="platform" className="py-2.5 pr-3 @2xl:whitespace-nowrap">
        <PlatformTrack row={row} />
      </td>
      <td data-cell="status" className="py-2.5 pr-3 @2xl:whitespace-nowrap">
        <DelayBadge
          status={row.status}
          delayMinutes={row.delayMinutes}
          direction={direction === 'arrivals' ? 'arrival' : 'departure'}
          estimatedDelayMinutes={row.estimatedDelayMinutes}
          predictedDelayMinutes={row.predictedDelayMinutes ?? null}
        />
        {/* W komórce statusu, nie przy strzałce: karta na telefonie chowa komórkę strzałki. */}
        {row.hasDisruption === true && (
          <span className="ml-1.5 inline-block align-middle text-warning-text">
            <AlertCircleIcon size={ICON_SIZE.inline} label="Utrudnienie na trasie" />
          </span>
        )}
      </td>
      <td data-cell="chevron" className="py-2.5 pr-1 text-text-muted">
        {canOpenDetails && (
          <span className="inline-flex transition group-hover:translate-x-0.5 group-hover:text-foreground">
            <ChevronRightIcon size={ICON_SIZE.inline} />
          </span>
        )}
      </td>
    </tr>
  )
}
