'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { favouriteKey, useFavourites, type Favourite } from '@/hooks/useFavourites'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useShareUrl } from '@/hooks/useShareUrl'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine } from '@/lib/gtfs/query'
import { GTFS_STOP_ID_PATTERN } from '@/lib/validation'
import { AlertBanner } from './AlertBanner'
import { AttributionFooter } from './AttributionFooter'
import { AsideCard, HourlyTraffic } from './aside'
import { CityWeatherCard } from './CityWeatherCard'
import { LineBadge } from './LineBadge'
import { MapView } from './MapView'
import { ScheduleStatus } from './ScheduleStatus'
import { stopDisplayName } from './stopName'
import { TransitDepartureList } from './TransitDepartureList'
import { MODE_LABEL, MODE_ORDER } from './transitMode'
import { AccessibleIcon, CheckIcon, ShareIcon, StarIcon } from './icons'

const LINE_KIND_LABEL = { regular: '', night: 'nocna', express: 'przyspieszona', replacement: 'zastępcza' } as const

type StopTab = 'departures' | 'lines' | 'schedule' | 'alerts'
const STOP_TABS: { key: StopTab; label: string }[] = [
  { key: 'departures', label: 'Najbliższe odjazdy' },
  { key: 'lines', label: 'Wszystkie linie' },
  { key: 'schedule', label: 'Pełny rozkład' },
  { key: 'alerts', label: 'Komunikaty' },
]
/** Odjazdy pobierane w jednej, wspólnej dla obu tabów odjazdowych liczbie — „Najbliższe" tnie do podglądu, „Pełny rozkład" pokazuje całość. */
const SCHEDULE_FETCH_LIMIT = 60
const NEAREST_PREVIEW_COUNT = 10

/** `sec` może przekroczyć 86400 (kurs po północy) — zwijamy do zegara doby. */
function clockOfSec(sec: number): string {
  const h = Math.floor(sec / 3600) % 24
  const m = Math.floor(sec / 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Ikona pinu na mapie: pierwszy tryb wg priorytetu prezentacji (`MODE_ORDER`) obecny na słupku. */
function primaryMode(lines: GtfsLine[]): GtfsMode {
  for (const mode of MODE_ORDER) {
    if (lines.some((l) => l.mode === mode)) return mode
  }
  return 'other'
}

function SummaryCard({ label, value, hint, className = '' }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`glass rounded-2xl p-4 ${className}`.trim()}>
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-foreground">{value}</div>
      {hint !== undefined && <div className="text-xs text-text-secondary">{hint}</div>}
    </div>
  )
}

/**
 * Szczegóły przystanku miejskiego — wzorem `FullBoard`, ale bez opóźnień
 * (komunikacja miejska ich nie ma: „rozkład", nigdy „na czas"). Wspólny
 * komponent dla samodzielnej trasy i osadzenia na ekranie miasta.
 */
export function TransitStopDetail({
  city,
  stopId,
  embedded = false,
  initialName,
  onNameResolved,
}: {
  city: string
  stopId: string
  embedded?: boolean
  /** Nazwa z linku (`?name=`) — nagłówek do czasu wczytania rozkładu, potem tablica ją nadpisuje. */
  initialName?: string
  /**
   * Wywoływane z ostateczną nazwą przystanku, gdy tablica ją zna — dla
   * rodzica, który renderuje własny breadcrumb NAD tym komponentem i inaczej
   * pokazywałby surowe `stopId` nawet po wczytaniu (dwa źródła nazwy w jednym
   * widoku, tego dotyczy AGENTS.md #2 duplikacji logiki).
   */
  onNameResolved?: (name: string) => void
}) {
  // `undefined` = jeszcze nie wybrano w tej sesji (idź za `?slupek=` albo
  // deep-linkiem), `null` = user jawnie wybrał cały zespół, `string` = wybrany słupek.
  const [slupekChoice, setSlupekChoice] = useState<string | null | undefined>(undefined)
  const [lineFilter, setLineFilter] = useState<string | null>(null)
  const [requestedMember, setRequestedMember] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<StopTab>('departures')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // Reset przy zmianie przystanku — ten sam idiom co useTransitBoard.ts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlupekChoice(undefined)
    setRequestedMember(null)
  }, [stopId])
  const rawUrlSlupek = searchParams.get('slupek')
  const urlSlupek = rawUrlSlupek !== null && GTFS_STOP_ID_PATTERN.test(rawUrlSlupek) ? rawUrlSlupek : null
  // Priorytet: jawny klik w tej sesji > `?slupek=` z URL > deep-link po segmencie
  // ścieżki (echo serwera) > cały zespół. Nieznany/zły `?slupek=` cicho ignorowany
  // (AGENTS.md #4) — serwer i tak odrzuci nieznany słupek i wróci do całego zespołu.
  const effSlupek = slupekChoice !== undefined ? slupekChoice : (urlSlupek ?? requestedMember)

  function selectSlupek(memberId: string | null): void {
    setSlupekChoice(memberId)
    const next = new URLSearchParams(searchParams.toString())
    if (memberId === null) next.delete('slupek')
    else next.set('slupek', memberId)
    const qs = next.toString()
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  // Jedno zapytanie na obie zakładki odjazdowe — „Pełny rozkład" pokazuje całą
  // listę do `SCHEDULE_FETCH_LIMIT`, „Najbliższe" tnie ją do podglądu niżej.
  const { data, error } = useTransitBoard(city, [stopId], SCHEDULE_FETCH_LIMIT, effSlupek)
  const { isFavourite, addFavourite, removeFavourite } = useFavourites()
  const { share, status: shareStatus } = useShareUrl()
  const now = useSnapshotNow(data)

  const board = data?.stops[0] ?? null
  // Po pierwszej odpowiedzi zapamiętaj, czy pytano wprost o słupek (deep-link z trasy linii).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (board?.requestedMember != null) setRequestedMember(board.requestedMember)
  }, [board?.requestedMember])
  useEffect(() => {
    if (board?.name != null) onNameResolved?.(board.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onNameResolved` to callback rodzica, nie stan śledzony tu
  }, [board?.name])
  // Pomijamy „słupki" bez linii (stacje-rodzice metra, np. 7014M) — nie da się
  // z nich odjechać, tylko zaśmiecają przełącznik.
  const members = useMemo(() => (board?.members ?? []).filter((m) => m.lines.length > 0), [board])
  const activeMember = effSlupek !== null ? members.find((m) => m.id === effSlupek) ?? null : null
  const stopName = board?.name ?? initialName ?? stopId
  const favourite: Favourite = { kind: 'gtfs', city, id: stopId, name: stopName }
  const key = favouriteKey(favourite)
  const pinned = isFavourite(key)
  const loading = data === null && error === null

  const departures = useMemo(
    () => (lineFilter === null ? (board?.departures ?? []) : (board?.departures ?? []).filter((d) => d.routeId === lineFilter)),
    [board, lineFilter]
  )

  const linesByMode = useMemo(() => {
    const groups = new Map<GtfsMode, GtfsLine[]>()
    for (const line of board?.lines ?? []) {
      const list = groups.get(line.mode) ?? []
      list.push(line)
      groups.set(line.mode, list)
    }
    return MODE_ORDER.filter((mode) => groups.has(mode)).map((mode) => [mode, groups.get(mode)!] as const)
  }, [board])

  const summary = board?.summary

  const mapPins = useMemo(
    () =>
      members.map((m) => {
        // Powiększona mapa (MapView.tsx) pokazuje 2 najbliższe odjazdy TEGO słupka w
        // popupie — dane już mamy w `board.departures`, zero nowego zapytania. Gdy
        // `effSlupek` zawęża odpowiedź do jednego słupka, pozostałe piny po prostu
        // nie dostają podglądu (degradacja, nie błąd).
        const preview = (board?.departures ?? [])
          .filter((d) => d.stopId === m.id)
          .slice()
          .sort((a, b) => a.departureSec - b.departureSec)
          .slice(0, 2)
          .map((d) => `${clockOfSec(d.departureSec)} → ${d.headsign ?? d.line}`)
        return {
          id: m.id,
          lat: m.lat,
          lon: m.lon,
          label: stopDisplayName(stopName, m.code ?? m.platformCode),
          mode: primaryMode(m.lines),
          preview,
        }
      }),
    [members, stopName, board]
  )

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass-strong glow-ring rounded-2xl p-5" style={{ '--glow-color': 'rgba(99, 102, 241, 0.18)' } as CSSProperties}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{stopName}</h1>
                {board?.wheelchairNote != null && (
                  <span
                    title={
                      board.wheelchairNote === 'inaccessible'
                        ? 'Przystanek niedostępny dla osób poruszających się na wózku'
                        : 'Część słupków tego przystanku niedostępna dla osób na wózku'
                    }
                    className="text-amber-600 dark:text-amber-400"
                  >
                    <AccessibleIcon size={18} />
                  </span>
                )}
              </div>
              {members.length > 1 && (
                <p className="mt-0.5 text-sm text-text-secondary">Zespół przystanków komunikacyjnych · {members.length} słupków</p>
              )}
              {activeMember !== null && (
                <p className="mt-0.5 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {stopDisplayName(stopName, activeMember.code ?? activeMember.platformCode)}
                  {activeMember.street !== null && <span className="text-text-secondary"> · {activeMember.street}</span>}
                </p>
              )}
              {board !== null && board.modes.length > 0 && (
                // Jeden `<p>` z jednym tekstowym węzłem — świadomie, nie chipy per tryb:
                // `page.test.tsx` odpytuje `/metro · tramwaj/` jako ciągły tekst.
                <p className="mt-1 text-sm text-text-secondary">
                  {board.modes.map((mode) => MODE_LABEL[mode]).join(' · ')}
                </p>
              )}
              {data !== null && (
                <div className="mt-2">
                  <ScheduleStatus schedule={data.schedule} cityName={city} error={error !== null} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {shareStatus !== 'idle' && (
                <span role="status" className="text-sm text-text-secondary">
                  {shareStatus === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować'}
                </span>
              )}
              {!embedded && (
                <button
                  type="button"
                  onClick={() => void share()}
                  className="card-hover inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <ShareIcon size={15} />
                  Udostępnij
                </button>
              )}
              <button
                type="button"
                onClick={() => (pinned ? removeFavourite(key) : addFavourite(favourite))}
                aria-label={pinned ? 'Odepnij z Pulpitu' : 'Przypnij do Pulpitu'}
                className="card-hover grid h-9 w-9 shrink-0 place-items-center rounded-full border text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                <StarIcon size={15} className={pinned ? 'fill-current text-amber-400' : ''} />
              </button>
            </div>
          </div>
        </section>

        {members.length > 1 && (
          <section className="glass rounded-2xl p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Słupki tego przystanku · {members.length}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              To zespół osobnych słupków — każdy z własnymi liniami i kierunkiem.
              Wybierz słupek, z którego wsiadasz lub wysiadasz.
            </p>
            <div
              role="tablist"
              aria-label="Słupek przystanku"
              className="mt-2.5 grid grid-flow-col auto-cols-[minmax(11rem,1fr)] gap-2 overflow-x-auto pb-1 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3"
            >
              <button
                type="button"
                role="tab"
                onClick={() => selectSlupek(null)}
                aria-selected={effSlupek === null}
                className={`card-hover relative rounded-xl border px-3 py-2.5 text-left text-xs transition ${effSlupek === null ? 'ring-2 ring-indigo-500 glow-ring' : ''}`}
                style={
                  effSlupek === null
                    ? ({ borderColor: 'transparent', '--glow-color': 'rgba(99, 102, 241, 0.4)' } as CSSProperties)
                    : { borderColor: 'var(--surface-border)' }
                }
              >
                {effSlupek === null && (
                  <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-white">
                    <CheckIcon size={10} />
                  </span>
                )}
                <span className="font-semibold">Cały przystanek</span>
                <span className="mt-0.5 block text-text-secondary">wszystkie słupki razem</span>
              </button>
              {members.map((member) => {
                const on = effSlupek === member.id
                const visibleLines = member.lines.slice(0, 5)
                const overflow = member.lines.length - visibleLines.length
                return (
                  <button
                    key={member.id}
                    type="button"
                    role="tab"
                    onClick={() => selectSlupek(member.id)}
                    aria-selected={on}
                    className={`card-hover relative flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'ring-2 ring-indigo-500 glow-ring' : ''}`}
                    style={
                      on
                        ? ({ borderColor: 'transparent', '--glow-color': 'rgba(99, 102, 241, 0.4)' } as CSSProperties)
                        : { borderColor: 'var(--surface-border)' }
                    }
                  >
                    {on && (
                      <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-white">
                        <CheckIcon size={10} />
                      </span>
                    )}
                    {/* Jeden węzeł tekstowy jak dawniej — nazwa dostępna przycisku musi
                        zaczynać się dokładnie od "Centrum 02" (testy jednostkowe/e2e
                        odpytują ten prefiks przez `getByText`/`getByRole(...,{name})`,
                        które nie łączą tekstu rozbitego na sąsiednie elementy). */}
                    <span className="pr-5 font-heading text-base font-extrabold tabular-nums text-foreground">
                      {stopDisplayName(stopName, member.code ?? member.platformCode)}
                    </span>
                    {member.street !== null && <span className="text-xs text-text-muted">{member.street}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      {visibleLines.map((line) => (
                        <LineBadge key={line.routeId} line={line.line} color={line.color} mode={line.mode} size="sm" />
                      ))}
                      {overflow > 0 && <span className="text-[11px] text-text-muted">+{overflow}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Linie" value={summary ? String(summary.lineCount) : '—'} className="card-hover" />
          <SummaryCard label="Odjazdy dziś" value={summary ? String(summary.departuresToday) : '—'} hint="wg rozkładu" className="card-hover" />
          <SummaryCard
            label="Pierwszy / ostatni"
            value={
              summary && summary.firstDepartureSec !== null && summary.lastDepartureSec !== null
                ? `${clockOfSec(summary.firstDepartureSec)}–${clockOfSec(summary.lastDepartureSec)}`
                : '—'
            }
            className="card-hover"
          />
        </div>

        <section className="glass rounded-2xl p-5">
          <div role="tablist" aria-label="Widok przystanku" className="mb-3 flex flex-wrap items-center gap-1.5">
            {STOP_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.key ? 'text-white' : 'text-text-secondary'
                }`}
                style={
                  activeTab === tab.key
                    ? { background: 'var(--accent-gradient)', borderColor: 'transparent' }
                    : { borderColor: 'var(--surface-border)' }
                }
              >
                {tab.label}
                {tab.key === 'alerts' && board !== null && board.alerts.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: activeTab === tab.key ? '#fff' : 'var(--status-delayed-bg)' }}
                  />
                )}
              </button>
            ))}
          </div>

          {(activeTab === 'departures' || activeTab === 'schedule') && (
            <>
              {board !== null && board.lines.length > 1 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLineFilter(null)}
                    aria-pressed={lineFilter === null}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      lineFilter === null ? 'text-white' : 'text-text-secondary'
                    }`}
                    style={lineFilter === null ? { background: 'var(--accent-gradient)', borderColor: 'transparent' } : { borderColor: 'var(--surface-border)' }}
                  >
                    Wszystkie
                  </button>
                  {board.lines.map((line) => (
                    <button
                      key={line.routeId}
                      type="button"
                      onClick={() => setLineFilter(lineFilter === line.routeId ? null : line.routeId)}
                      aria-pressed={lineFilter === line.routeId}
                      className="rounded-full"
                    >
                      <span style={{ opacity: lineFilter !== null && lineFilter !== line.routeId ? 0.4 : 1 }}>
                        <LineBadge line={line.line} color={line.color} mode={line.mode} size="sm" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <TransitDepartureList
                departures={activeTab === 'departures' ? departures.slice(0, NEAREST_PREVIEW_COUNT) : departures}
                loading={loading}
                city={city}
                showSlupek={activeMember === null && members.length > 1}
                now={now}
                highlightFirst={activeTab === 'departures'}
              />
            </>
          )}

          {activeTab === 'lines' &&
            (linesByMode.length === 0 ? (
              <p className="text-sm text-text-muted">—</p>
            ) : (
              <div className="flex flex-col gap-3">
                {linesByMode.map(([mode, lines]) => (
                  <div key={mode}>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
                      {MODE_LABEL[mode]}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {lines.map((line) => (
                        <span key={line.routeId} className="inline-flex items-center gap-1.5">
                          <LineBadge
                            line={line.line}
                            color={line.color}
                            mode={line.mode}
                            href={`/city/${city}/line/${encodeURIComponent(line.routeId)}`}
                          />
                          {LINE_KIND_LABEL[line.kind] !== '' && (
                            <span className="text-xs text-text-muted">{LINE_KIND_LABEL[line.kind]}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === 'alerts' &&
            (board === null || board.alerts.length === 0 ? (
              <p className="text-sm text-text-muted">Aktualnie brak komunikatów dla tego przystanku.</p>
            ) : (
              <AlertBanner alerts={board.alerts} />
            ))}
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <CityWeatherCard city={city} />

        {mapPins.length > 0 && (
          <AsideCard title="Mapa" className="card-hover">
            <MapView pins={mapPins} onPinClick={setSlupekChoice} ariaLabel={`Mapa przystanku ${stopName}`} />
          </AsideCard>
        )}

        <AsideCard title="Natężenie ruchu dziś" className="card-hover">
          <HourlyTraffic
            hourly={summary?.hourly ?? null}
            loading={loading}
            currentHour={new Date(now).getHours()}
            emptyLabel="Rozkład na dziś nie zawiera odjazdów z tego przystanku."
          />
        </AsideCard>

        <AsideCard title="Linie na tym przystanku" className="card-hover">
          {linesByMode.length === 0 ? (
            <p className="text-xs text-text-muted">—</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {linesByMode.map(([mode, lines]) => (
                <div key={mode}>
                  <div className="mb-1 text-xs text-text-muted">{MODE_LABEL[mode]}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lines.map((line) => (
                      <span key={line.routeId} className="inline-flex items-center gap-1">
                        <LineBadge
                          line={line.line}
                          color={line.color}
                          mode={line.mode}
                          size="sm"
                          href={`/city/${city}/line/${encodeURIComponent(line.routeId)}`}
                        />
                        {LINE_KIND_LABEL[line.kind] !== '' && (
                          <span className="text-[10px] text-text-muted">{LINE_KIND_LABEL[line.kind]}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsideCard>

        <AttributionFooter attribution={data?.attribution ?? []} />
      </aside>
    </div>
  )
}
