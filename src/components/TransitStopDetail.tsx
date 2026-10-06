'use client'

import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCities } from '@/hooks/useCities'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useRecentPlaces } from '@/hooks/useRecentPlaces'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine } from '@/lib/gtfs/query'
import { GTFS_STOP_ID_PATTERN } from '@/lib/validation'
import { formatSecondsOfDay } from '@/lib/format'
import { getCity } from '@/lib/gtfs/cities'
import { zonedHour } from '@/lib/pkp/time'
import { AlertBanner } from './AlertBanner'
import { AttributionFooter } from './AttributionFooter'
import { AsideCard, HourlyTraffic } from './aside'
import { CityWeatherCard } from './CityWeatherCard'
import { LineBadge } from './LineBadge'
import { MapView } from './MapView'
import { ScheduleStatus } from './ScheduleStatus'
import { stopDisplayName, stopsWithLines } from './stopName'
import { TransitDepartureList } from './TransitDepartureList'
import { LINE_KIND_LABEL, MODE_LABEL, MODE_ORDER } from './transitMode'
import { AccessibleIcon, AlertCircleIcon, CheckIcon, StarIcon, ICON_SIZE } from './icons'
import { PageTitle } from './PageTitle'
import { InfoButton, InfoSheet } from './InfoSheet'
import { IconButton } from './IconButton'
import { onTablistKeyDown } from './tablistKeys'
import { pluralPl } from '@/lib/plural'

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

/** Ikona pinu na mapie: pierwszy tryb wg priorytetu prezentacji (`MODE_ORDER`) obecny na przystanku. */
function primaryMode(lines: GtfsLine[]): GtfsMode {
  for (const mode of MODE_ORDER) {
    if (lines.some((l) => l.mode === mode)) return mode
  }
  return 'other'
}

/** Kafelek podsumowania; poniżej `sm` pigułka (etykieta + liczba), żeby odjazdy były wyżej. */
function SummaryCard({ label, value, hint, className = '' }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`glass rounded-2xl p-4 max-sm:flex max-sm:items-baseline max-sm:gap-1.5 max-sm:rounded-full max-sm:px-2.5 max-sm:py-1 ${className}`.trim()}>
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted max-sm:normal-case max-sm:tracking-normal">{label} </div>
      <div className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-foreground max-sm:mt-0 max-sm:text-sm">{value}</div>
      {hint !== undefined && <div className="text-xs text-text-secondary max-sm:hidden">{hint}</div>}
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
  // `undefined` = jeszcze nie wybrano w tej sesji (idź za `?przystanek=` albo
  // deep-linkiem), `null` = user jawnie wybrał cały zespół, `string` = wybrany przystanek.
  const [memberChoice, setMemberChoice] = useState<string | null | undefined>(undefined)
  const [lineFilter, setLineFilter] = useState<string | null>(null)
  const [requestedMember, setRequestedMember] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<StopTab>('departures')
  /** Arkusz „Info” (telefon): mapa, pogoda, natężenie i linie z prawej kolumny. */
  const [infoOpen, setInfoOpen] = useState(false)
  /**
   * Kontekst (kafelki, pogoda, mapa…) istnieje w JEDNYM miejscu: od `sm` w prawej kolumnie, na telefonie
   * tylko w arkuszu „Info” — ukryta kopia montowałaby drugą mapę MapLibre i dublowała tekst. W SSR „szeroko”,
   * do hydracji kolumnę na telefonie chowa CSS (`max-sm:hidden`).
   */
  const wide = useMediaQuery(SM_UP, true)
  const tabIdBase = useId()
  const viewTabId = (tab: StopTab): string => `${tabIdBase}-tab-${tab}`
  const viewPanelId = `${tabIdBase}-panel`
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // Reset przy zmianie przystanku — ten sam idiom co useTransitBoard.ts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberChoice(undefined)
    setRequestedMember(null)
  }, [stopId])
  const rawUrlMember = searchParams.get('przystanek')
  const urlMember = rawUrlMember !== null && GTFS_STOP_ID_PATTERN.test(rawUrlMember) ? rawUrlMember : null
  // Priorytet: jawny klik w tej sesji > `?przystanek=` z URL > deep-link po segmencie
  // ścieżki (echo serwera) > cały zespół. Nieznany/zły `?przystanek=` cicho ignorowany
  // (AGENTS.md #4) — serwer i tak odrzuci nieznany przystanek i wróci do całego zespołu.
  const effMember = memberChoice !== undefined ? memberChoice : (urlMember ?? requestedMember)

  function selectMember(memberId: string | null): void {
    setMemberChoice(memberId)
    const next = new URLSearchParams(searchParams.toString())
    if (memberId === null) next.delete('przystanek')
    else next.set('przystanek', memberId)
    const qs = next.toString()
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  // Jedno zapytanie na obie zakładki odjazdowe — „Pełny rozkład" pokazuje całą
  // listę do `SCHEDULE_FETCH_LIMIT`, „Najbliższe" tnie ją do podglądu niżej.
  const { data, error, loading, failed } = useTransitBoard(city, [stopId], SCHEDULE_FETCH_LIMIT, effMember)
  // Nazwa miasta z `/api/cities` — jeden wspólny hook z `CityWeatherCard`,
  // `TransitStopCard` i stroną miasta (Task 9). Fallback do slugu, dopóki
  // lista się nie wczyta / gdy fetch zawiedzie.
  const { cities: cityEntries } = useCities()
  const cityName = cityEntries.find((entry) => entry.id === city)?.name ?? city
  const { isPinned, addPinned, removePinned } = usePinned()
  const now = useSnapshotNow(data)

  const board = data?.stops[0] ?? null
  // Po pierwszej odpowiedzi zapamiętaj, czy pytano wprost o przystanek (deep-link z trasy linii).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (board?.requestedMember != null) setRequestedMember(board.requestedMember)
  }, [board?.requestedMember])
  useEffect(() => {
    if (board?.name != null) onNameResolved?.(board.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onNameResolved` to callback rodzica, nie stan śledzony tu
  }, [board?.name])
  // Pomijamy „przystanki" bez linii (stacje-rodzice metra, np. 7014M) — nie da się
  // z nich odjechać, tylko zaśmiecają przełącznik.
  const members = useMemo(() => stopsWithLines(board?.members), [board])
  // Kolejność zakładek: „Cały zespół” (null), potem przystanki. Nieznany `?przystanek=` (poprawny format,
  // spoza zespołu) nie zaznacza żadnej — przystanek Tab dostaje wtedy pierwsza.
  const memberIds: (string | null)[] = [null, ...members.map((member) => member.id)]
  const memberIndex = Math.max(0, memberIds.indexOf(effMember))
  const activeMember = effMember !== null ? members.find((m) => m.id === effMember) ?? null : null
  const stopName = board?.name ?? initialName ?? stopId
  // Widok całego zespołu (kilka przystanków, żaden niewybrany) mówi „zespół"; jeden
  // przystanek — wybrany albo jedyny w zespole — mówi „przystanek".
  const wholeGroup = activeMember === null && members.length > 1
  const scopeGenitive = wholeGroup ? 'tego zespołu' : 'tego przystanku'
  // Przypinamy to, co user widzi: wybrany przystanek (z numerem) albo cały zespół — po id
  // zespołu, nie po `stopId` ze ścieżki, który bywa przystankiem z deep-linku.
  const pinnedItem: PinnedItem =
    activeMember !== null
      ? { kind: 'gtfs', city, id: activeMember.id, name: stopDisplayName(stopName, activeMember.code ?? activeMember.platformCode), member: true }
      : { kind: 'gtfs', city, id: board?.groupId ?? stopId, name: stopName }
  const key = pinnedKey(pinnedItem)
  const pinned = isPinned(key)

  // „Ostatnio oglądane": te same wartości co `pinnedItem` (id zespołu, nazwa z numerem),
  // zapis dopiero po wczytaniu tablicy i po ustaleniu przystanku — deep-link z trasy linii
  // wybiera przystanek jeden render po odpowiedzi, a wcześniej zapisałby się sam zespół.
  const { record: recordRecentPlace } = useRecentPlaces()
  const boardLoaded = board !== null
  const memberSettled = board?.requestedMember == null || effMember !== null || memberChoice !== undefined
  const recentId = board?.groupId ?? stopId
  const recentMember = activeMember?.id
  const recentName = activeMember !== null ? stopDisplayName(stopName, activeMember.code ?? activeMember.platformCode) : stopName
  useEffect(() => {
    if (!boardLoaded || !memberSettled) return
    recordRecentPlace({ kind: 'gtfs', city, id: recentId, name: recentName, ...(recentMember !== undefined && { member: recentMember }) })
  }, [boardLoaded, memberSettled, city, recentId, recentMember, recentName, recordRecentPlace])

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

  const { resolvedTheme } = useTheme()
  const mapPins = useMemo(
    () =>
      members.map((m) => {
        // Powiększona mapa (MapView.tsx) pokazuje 2 najbliższe odjazdy TEGO przystanku w
        // popupie — dane już mamy w `board.departures`, zero nowego zapytania. Gdy
        // `effMember` zawęża odpowiedź do jednego przystanku, pozostałe piny po prostu
        // nie dostają podglądu (degradacja, nie błąd).
        const preview = (board?.departures ?? [])
          .filter((d) => d.stopId === m.id)
          .slice()
          .sort((a, b) => a.departureSec - b.departureSec)
          .slice(0, 2)
          .map((d) => `${formatSecondsOfDay(d.departureSec)} → ${d.headsign ?? d.line}`)
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

  const asideCards = (
    <>
      <CityWeatherCard city={city} />

      {mapPins.length > 0 && (
        <AsideCard title="Mapa" className="card-hover">
          <MapView pins={mapPins} onPinClick={setMemberChoice} ariaLabel={members.length > 1 ? `Mapa zespołu przystanków ${stopName}` : `Mapa przystanku ${stopName}`} dark={resolvedTheme === 'dark'} />
        </AsideCard>
      )}

      <AsideCard title="Natężenie ruchu dziś" className="card-hover">
        <HourlyTraffic
          hourly={summary?.hourly ?? null}
          loading={loading}
          currentHour={zonedHour(now, getCity(city)?.timezone ?? 'Europe/Warsaw')}
          emptyLabel={`Rozkład na dziś nie zawiera odjazdów z ${scopeGenitive}.`}
          unknownLabel={board !== null && board.summary === null ? 'Brak rozkładu na dziś.' : undefined}
        />
      </AsideCard>

      <AsideCard title={wholeGroup ? 'Linie w tym zespole' : 'Linie na tym przystanku'} className="card-hover">
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
                        mode={line.mode}
                        kind={line.kind}
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
    </>
  )

  return (
    <div className="grid items-start gap-5 max-sm:gap-3 xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]">
      {/* Na telefonie odjazdy pierwsze: przystanki zespołu jako chipy, podsumowanie jako pigułki,
          kontekst (mapa, pogoda, natężenie, linie) w arkuszu „Info”. */}
      <div className="flex min-w-0 flex-col gap-5 max-sm:gap-3">
        <section className="glass-strong glow-ring rounded-2xl p-5 max-sm:p-4" style={{ '--glow-color': 'rgba(99, 102, 241, 0.18)' } as CSSProperties}>
          <div className="flex flex-wrap items-start justify-between gap-3 max-sm:flex-nowrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PageTitle as={embedded ? 'h2' : 'h1'} className="max-sm:text-xl">
                  {stopName}
                </PageTitle>
                {board?.wheelchairNote != null && (
                  <span className="text-warning-text">
                    <AccessibleIcon
                      size={ICON_SIZE.tile}
                      label={
                        board.wheelchairNote === 'inaccessible'
                          ? 'Żaden przystanek zespołu nie jest dostępny dla osób na wózku'
                          : 'Część przystanków zespołu niedostępna dla osób na wózku'
                      }
                    />
                  </span>
                )}
              </div>
              {members.length > 1 && (
                <p className="mt-0.5 text-sm text-text-secondary">
                  Zespół przystanków · {members.length} {pluralPl(members.length, 'przystanek', 'przystanki', 'przystanków')}
                </p>
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
                <p className="mt-1 text-sm text-text-secondary max-sm:hidden">
                  {board.modes.map((mode) => MODE_LABEL[mode]).join(' · ')}
                </p>
              )}
              {data !== null && (
                <div className="mt-2">
                  <ScheduleStatus schedule={data.schedule} cityName={cityName} error={error !== null} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IconButton
                label={pinned ? 'Odepnij z Pulpitu' : 'Przypnij do Pulpitu'}
                onClick={() => (pinned ? removePinned(key) : addPinned(pinnedItem))}
                // Do pierwszej odpowiedzi nie wiadomo, czy widać zespół, czy jeden przystanek
                // (deep-link z linii zaznacza przystanek dopiero po niej) — przypięcie zapisałoby zły zakres.
                disabled={board === null}
              >
                <StarIcon size={ICON_SIZE.button} filled={pinned} />
              </IconButton>
            </div>
          </div>
        </section>

        {members.length > 1 && (
          <section className="glass rounded-2xl p-4 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
            <div className="text-xs font-medium uppercase tracking-wide text-text-muted max-sm:sr-only">
              Przystanki w zespole · {members.length}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary max-sm:hidden">
              Każdy przystanek zespołu ma własne linie i kierunek. Wybierz ten, z którego
              wsiadasz lub wysiadasz.
            </p>
            <div
              role="tablist"
              aria-label="Przystanek w zespole"
              onKeyDown={(event) => onTablistKeyDown(event, memberIndex, (index) => selectMember(memberIds[index]))}
              // Telefon: jeden przewijany rząd chipów 44 px (sam numer); od `sm` karty z ulicą i liniami.
              className="mt-2 grid grid-flow-col auto-cols-max gap-2 overflow-x-auto pb-1 sm:mt-2.5 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3"
            >
              <button
                type="button"
                role="tab"
                onClick={() => selectMember(null)}
                aria-selected={effMember === null}
                tabIndex={memberIndex === 0 ? 0 : -1}
                className={`card-hover relative rounded-xl border px-3 py-2.5 text-left text-xs transition max-sm:min-h-11 max-sm:py-2 ${effMember === null ? 'glow-ring border-transparent ring-2 ring-indigo-500' : 'border-surface-border'}`}
                style={effMember === null ? ({ '--glow-color': 'rgba(99, 102, 241, 0.4)' } as CSSProperties) : undefined}
              >
                {effMember === null && (
                  <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-white max-sm:hidden">
                    <CheckIcon className="h-2.5 w-2.5" />
                  </span>
                )}
                <span className="font-semibold">Cały zespół</span>
                <span className="mt-0.5 block text-text-secondary max-sm:hidden">wszystkie przystanki razem</span>
              </button>
              {members.map((member, index) => {
                const on = effMember === member.id
                const visibleLines = member.lines.slice(0, 5)
                const overflow = member.lines.length - visibleLines.length
                return (
                  <button
                    key={member.id}
                    type="button"
                    role="tab"
                    onClick={() => selectMember(member.id)}
                    aria-selected={on}
                    tabIndex={memberIndex === index + 1 ? 0 : -1}
                    className={`card-hover relative flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition max-sm:min-h-11 max-sm:justify-center max-sm:py-2 ${on ? 'glow-ring border-transparent ring-2 ring-indigo-500' : 'border-surface-border'}`}
                    style={on ? ({ '--glow-color': 'rgba(99, 102, 241, 0.4)' } as CSSProperties) : undefined}
                  >
                    {on && (
                      <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-indigo-500 text-white max-sm:hidden">
                        <CheckIcon className="h-2.5 w-2.5" />
                      </span>
                    )}
                    {/* Jeden węzeł tekstowy jak dawniej — nazwa dostępna przycisku musi
                        zaczynać się dokładnie od "Centrum 02" (testy jednostkowe/e2e
                        odpytują ten prefiks przez `getByText`/`getByRole(...,{name})`,
                        które nie łączą tekstu rozbitego na sąsiednie elementy). */}
                    <span className="pr-5 font-heading text-base font-extrabold tabular-nums text-foreground max-sm:pr-0 max-sm:text-sm">
                      {stopDisplayName(stopName, member.code ?? member.platformCode)}
                    </span>
                    {member.street !== null && <span className="text-xs text-text-muted max-sm:hidden">{member.street}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 max-sm:hidden">
                      {visibleLines.map((line) => (
                        <LineBadge key={line.routeId} line={line.line} mode={line.mode} kind={line.kind} size="sm" />
                      ))}
                      {overflow > 0 && <span className="text-[11px] text-text-muted">+{overflow}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="grid gap-3 max-sm:flex max-sm:flex-wrap max-sm:gap-1.5 sm:grid-cols-3">
          {/* Telefon: liczbę linii widać w filtrze linii poniżej — pigułki mieszczą się w jednym rzędzie. */}
          <SummaryCard label="Linie" value={summary ? String(summary.lineCount) : '—'} className="card-hover max-sm:hidden!" />
          <SummaryCard label="Odjazdy dziś" value={summary ? String(summary.departuresToday) : '—'} hint="wg rozkładu" className="card-hover" />
          <SummaryCard
            label="Pierwszy / ostatni"
            value={
              summary && summary.firstDepartureSec !== null && summary.lastDepartureSec !== null
                ? `${formatSecondsOfDay(summary.firstDepartureSec)}–${formatSecondsOfDay(summary.lastDepartureSec)}`
                : '—'
            }
            className="card-hover"
          />
        </div>

        <section className="glass rounded-2xl p-5 max-sm:p-4">
          {/* Telefon: zakładki i filtr linii przyklejone pod nagłówkiem aplikacji, każdy rząd
              przewijany w poziomie (cele 44 px); „Info” poza przewijaniem, zawsze pod ręką. */}
          <div
            data-testid="stop-tabs-bar"
            className="mb-3 flex flex-col gap-2 max-sm:sticky max-sm:top-[var(--header-h)] max-sm:z-20 max-sm:-mx-4 max-sm:-mt-4 max-sm:rounded-t-2xl max-sm:bg-[var(--sheet-surface)] max-sm:px-4 max-sm:py-2"
          >
            <div className="flex items-center gap-2">
              <div
                role="tablist"
                aria-label="Widok przystanku"
                onKeyDown={(event) => onTablistKeyDown(event, STOP_TABS.findIndex((tab) => tab.key === activeTab), (index) => setActiveTab(STOP_TABS[index].key))}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1"
              >
                {STOP_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={viewTabId(tab.key)}
                    aria-controls={viewPanelId}
                    aria-selected={activeTab === tab.key}
                    tabIndex={activeTab === tab.key ? 0 : -1}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition max-sm:min-h-11 ${
                      activeTab === tab.key ? 'border-transparent text-white' : 'border-surface-border text-text-secondary'
                    }`}
                    style={activeTab === tab.key ? { background: 'var(--accent-gradient)' } : undefined}
                  >
                    {tab.label}
                    {tab.key === 'alerts' && (board?.alerts?.length ?? 0) > 0 && (
                      <AlertCircleIcon
                        size={ICON_SIZE.inline}
                        label="aktywne utrudnienia"
                        className={`shrink-0 ${activeTab === tab.key ? 'text-white' : 'text-warning-text'}`}
                      />
                    )}
                  </button>
                ))}
              </div>
              <InfoButton open={infoOpen} onClick={() => setInfoOpen((open) => !open)} />
            </div>

            {(activeTab === 'departures' || activeTab === 'schedule') && board !== null && board.lines.length > 1 && (
              <div role="group" aria-label="Filtr linii" className="flex flex-wrap items-center gap-1.5 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1">
                <button
                  type="button"
                  onClick={() => setLineFilter(null)}
                  aria-pressed={lineFilter === null}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition max-sm:min-h-11 max-sm:px-3.5 ${
                    lineFilter === null ? 'border-transparent text-white' : 'border-surface-border text-text-secondary'
                  }`}
                  style={lineFilter === null ? { background: 'var(--accent-gradient)' } : undefined}
                >
                  Wszystkie
                </button>
                {board.lines.map((line) => (
                  <button
                    key={line.routeId}
                    type="button"
                    onClick={() => setLineFilter(lineFilter === line.routeId ? null : line.routeId)}
                    aria-pressed={lineFilter === line.routeId}
                    className="grid shrink-0 place-items-center rounded-full max-sm:min-h-11 max-sm:min-w-11"
                  >
                    <span style={{ opacity: lineFilter !== null && lineFilter !== line.routeId ? 0.4 : 1 }}>
                      <LineBadge line={line.line} mode={line.mode} kind={line.kind} size="sm" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div role="tabpanel" id={viewPanelId} aria-labelledby={viewTabId(activeTab)}>
            {(activeTab === 'departures' || activeTab === 'schedule') && (
              <TransitDepartureList
                departures={activeTab === 'departures' ? departures.slice(0, NEAREST_PREVIEW_COUNT) : departures}
                loading={loading}
                emptyMessage={failed ? 'Nie udało się pobrać rozkładu.' : undefined}
                city={city}
                showStopCode={activeMember === null && members.length > 1}
                now={now}
                highlightFirst={activeTab === 'departures'}
              />
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
                              mode={line.mode}
                              kind={line.kind}
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
              (board === null || board.alerts === null ? (
                // Tablica albo feed alertów jeszcze nie odpowiedział — nieznane, nie „brak" (#7); hook ponawia
                // drabinką. Bez tablicy nie wiadomo też, czy to zespół, czy przystanek (żadnego „tego przystanku").
                <p className="text-sm text-text-muted">Wczytywanie komunikatów…</p>
              ) : board.alerts.length > 0 ? (
                <AlertBanner alerts={board.alerts} />
              ) : (
                <p className="text-sm text-text-muted">Aktualnie brak komunikatów dla {scopeGenitive}.</p>
              ))}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
        {/* Telefon: karty są w arkuszu „Info”; licencja danych zostaje widoczna pod tablicą. */}
        {wide && <div className="contents max-sm:hidden">{asideCards}</div>}
        <AttributionFooter attribution={data?.attribution ?? []} />
      </aside>

      {!wide && infoOpen && (
        <InfoSheet title="Informacje o przystanku" onClose={() => setInfoOpen(false)}>
          {asideCards}
        </InfoSheet>
      )}
    </div>
  )
}
