import Link from 'next/link'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { pluralPl } from '@/lib/plural'
import { ArrowRightIcon, DisclosureIcon, ICON_SIZE } from './icons'
import { LineBadge } from './LineBadge'
import { BUS_KIND_LABEL, BUS_KIND_ORDER, LINE_KIND_LABEL, MODE_ICON, MODE_ORDER, darkRingClass, lineColor } from './transitMode'

/** Nagłówki sekcji (liczba mnoga) — `MODE_LABEL` to liczba pojedyncza („tramwaj”) i służy gdzie indziej. */
const SECTION_LABEL: Record<GtfsMode, string> = {
  metro: 'Metro',
  tram: 'Tramwaje',
  bus: 'Autobusy',
  rail: 'Kolej',
  other: 'Inne',
}

const linesCount = (n: number) => `${n} ${pluralPl(n, 'linia', 'linie', 'linii')}`
const lineHref = (city: string, routeId: string) => `/city/${city}/line/${encodeURIComponent(routeId)}`

/** „A – B” → `['A', 'B']` (pierwszy separator). Bez separatora `null` — myślnik w nazwie przystanku to nie separator. */
export function splitEndStops(longName: string): [string, string] | null {
  const at = longName.indexOf(' – ')
  return at < 0 ? null : [longName.slice(0, at), longName.slice(at + 3)]
}

/** Nazwa dostępnościowa linku: „Linia N: A – B” (pełna nazwa, bo wizualnie kierunek jest przycięty). */
const lineName = (entry: LineListEntry) => (entry.longName === '' ? `Linia ${entry.line}` : `Linia ${entry.line}: ${entry.longName}`)

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
const HOVER = 'hover:bg-black/5 dark:hover:bg-white/5'
const SUMMARY_RESET = 'list-none [&::-webkit-details-marker]:hidden'

/** „A → B” ze strzałką kierunku z `icons.tsx` (dekoracyjna — nazwa linku niesie pełny kierunek); bez separatora cała nazwa. */
function Direction({ entry }: { entry: LineListEntry }) {
  const ends = splitEndStops(entry.longName)
  if (ends === null) return entry.longName
  return (
    <>
      {ends[0]} <ArrowRightIcon size={ICON_SIZE.inline} className="inline align-[-2px]" /> {ends[1]}
    </>
  )
}

function LineTile({ entry, city }: { entry: LineListEntry; city: string }) {
  return (
    <Link
      href={lineHref(city, entry.routeId)}
      aria-label={lineName(entry)}
      className={`flex min-h-[52px] min-w-0 flex-col gap-0.5 rounded-[10px] border border-surface-border px-2.5 py-1.5 transition ${HOVER} ${FOCUS_RING}`}
    >
      <span className="flex">
        <LineBadge line={entry.line} mode={entry.mode} kind={entry.kind} />
      </span>
      {entry.longName !== '' && (
        <span className="truncate text-xs text-text-secondary">
          <Direction entry={entry} />
        </span>
      )}
    </Link>
  )
}

function TileGrid({ lines, city }: { lines: LineListEntry[]; city: string }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 pb-2 pt-1">
      {lines.map((entry) => (
        <li key={entry.routeId} className="min-w-0">
          <LineTile entry={entry} city={city} />
        </li>
      ))}
    </ul>
  )
}

function Pictogram({ mode }: { mode: GtfsMode }) {
  const Icon = MODE_ICON[mode]
  const { bg, fg } = lineColor(mode, 'regular')
  return (
    <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={{ background: bg, color: fg }}>
      <Icon size={ICON_SIZE.tile} />
    </span>
  )
}

type Props = {
  linesByMode: Record<GtfsMode, LineListEntry[]>
  city: string
  /** Stan rozwinięcia sekcji (`useSectionOpen`); klucz = rodzaj środka albo `bus:<rodzaj linii>`. */
  isOpen: (key: string, lineCount: number) => boolean
  /** Użytkownik zwinął/rozwinął sekcję (`details.open` po zmianie). */
  onToggle: (key: string, open: boolean, lineCount: number) => void
}

/**
 * Lista linii miasta: zwijana sekcja na rodzaj środka (natywne `<details>` — klawiatura i czytnik ekranu
 * za darmo), w autobusach podsekcje wg rodzaju linii. Puste sekcje nie są renderowane. Kafel to link do
 * przebiegu linii. Wywołujący renderuje to dopiero, gdy lista linii jest wczytana (stan domyślny
 * sekcji zależy od szerokości ekranu, którą hook zna dopiero po zamontowaniu).
 */
export function LineGrid({ linesByMode, city, isOpen, onToggle }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      {MODE_ORDER.filter((mode) => linesByMode[mode].length > 0).map((mode) => {
        const lines = linesByMode[mode]
        // Sekcja autobusów zawiera wyłącznie zwijane podsekcje — jej własny rozmiar nie ma znaczenia dla domyślnego stanu.
        const defaultCount = mode === 'bus' ? 0 : lines.length
        return (
          <details
            key={mode}
            data-testid="line-section"
            open={isOpen(mode, defaultCount)}
            onToggle={(event) => onToggle(mode, event.currentTarget.open, defaultCount)}
            className="glass rounded-2xl"
          >
            <summary className={`${SUMMARY_RESET} flex min-h-14 cursor-pointer items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${HOVER} ${FOCUS_RING}`}>
              <Pictogram mode={mode} />
              <span className="text-[15px] font-semibold text-foreground">{SECTION_LABEL[mode]}</span>
              <span className="text-xs text-text-muted">{linesCount(lines.length)}</span>
              <DisclosureIcon size={ICON_SIZE.button} className="ml-auto text-text-muted" />
            </summary>
            <div className="px-3.5 pb-3.5 pt-0.5">
              {mode === 'bus' ? <BusSubsections lines={lines} city={city} isOpen={isOpen} onToggle={onToggle} /> : <TileGrid lines={lines} city={city} />}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function BusSubsections({ lines, city, isOpen, onToggle }: { lines: LineListEntry[]; city: string } & Pick<Props, 'isOpen' | 'onToggle'>) {
  return (
    <>
      {BUS_KIND_ORDER.map((kind) => {
        const ofKind = lines.filter((entry) => entry.kind === kind)
        if (ofKind.length === 0) return null
        const key = `bus:${kind}`
        return (
          <details
            key={kind}
            data-testid="line-subsection"
            open={isOpen(key, ofKind.length)}
            onToggle={(event) => onToggle(key, event.currentTarget.open, ofKind.length)}
            className="border-t border-surface-border first:border-t-0"
          >
            <summary className={`${SUMMARY_RESET} flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-0.5 py-1.5 text-[13px] text-text-secondary ${HOVER} ${FOCUS_RING}`}>
              <span className={`h-3 w-3 flex-none rounded-[3px] ${darkRingClass(kind)}`} style={{ background: lineColor('bus', kind).bg }} aria-hidden="true" />
              <span>
                {BUS_KIND_LABEL[kind]} · {ofKind.length}
              </span>
              <DisclosureIcon size={ICON_SIZE.button} className="ml-auto text-text-muted" />
            </summary>
            <TileGrid lines={ofKind} city={city} />
          </details>
        )
      })}
    </>
  )
}

/** Wyniki szukania: płaska lista ze wszystkich środków, z plakietką rodzaju linii (nocna, przyspieszona…). */
export function LineResults({ lines, city }: { lines: LineListEntry[]; city: string }) {
  return (
    <section className="glass rounded-2xl p-3.5">
      <h2 className="mb-1 text-sm font-bold text-foreground">Wyniki · {lines.length}</h2>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-text-secondary">Brak linii pasujących do wyszukiwania.</p>
      ) : (
        <ul>
          {lines.map((entry) => {
            const chip = LINE_KIND_LABEL[entry.kind]
            return (
              <li key={entry.routeId} className="border-t border-surface-border first:border-t-0">
                <Link
                  href={lineHref(city, entry.routeId)}
                  aria-label={chip === '' ? lineName(entry) : `${lineName(entry)}, ${chip}`}
                  className={`flex min-h-12 items-center gap-2.5 rounded-lg px-1 py-1.5 ${HOVER} ${FOCUS_RING}`}
                >
                  <LineBadge line={entry.line} mode={entry.mode} kind={entry.kind} />
                  <span className="min-w-0 truncate text-sm text-foreground">
                    <Direction entry={entry} />
                  </span>
                  {chip !== '' && (
                    <span className="ml-auto whitespace-nowrap rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-text-secondary dark:bg-white/10">{chip}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** „Ostatnio oglądane” (`useRecentLines`): ukryte, gdy brak wpisów; id spoza bieżącej listy linii pomijane. */
export function RecentLines({ recent, lines, city }: { recent: string[]; lines: LineListEntry[]; city: string }) {
  const byId = new Map(lines.map((entry) => [entry.routeId, entry]))
  const known = recent.flatMap((id) => byId.get(id) ?? [])
  if (known.length === 0) return null
  return (
    <div role="group" aria-label="Ostatnio oglądane" className="flex flex-wrap items-center gap-x-1.5">
      <span aria-hidden="true" className="mr-0.5 text-xs text-text-muted">
        Ostatnio oglądane
      </span>
      {known.map((entry) => (
        <Link
          key={entry.routeId}
          href={lineHref(city, entry.routeId)}
          aria-label={lineName(entry)}
          title={entry.longName}
          className={`inline-flex min-h-11 items-center rounded-md ${FOCUS_RING}`}
        >
          <LineBadge line={entry.line} mode={entry.mode} kind={entry.kind} size="sm" />
        </Link>
      ))}
    </div>
  )
}
