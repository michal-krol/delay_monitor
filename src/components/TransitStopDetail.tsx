'use client'

import { startTransition, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCities } from '@/hooks/useCities'
import { pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { useRecentPlaces } from '@/hooks/useRecentPlaces'
import { useNearViewport } from '@/hooks/useNearViewport'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine } from '@/lib/gtfs/query'
import { dedupeAlerts, toContextAlertsState, type ContextAlertsState } from '@/lib/gtfs/alertView'
import { GTFS_ROUTE_ID_PATTERN, GTFS_STOP_ID_PATTERN } from '@/lib/validation'
import { formatSecondsOfDay } from '@/lib/format'
import { getCity } from '@/lib/gtfs/cities'
import { zonedHour } from '@/lib/pkp/time'
import { patchUrlParams } from '@/lib/urlState'
import { AttributionFooter } from './AttributionFooter'
import { AsideCard, HourlyTraffic } from './aside'
import { ContextAlerts } from './ContextAlerts'
import { LineBadge } from './LineBadge'
import { MapView } from './MapView'
import { MAP_ZOOM } from './map/mapData'
import { formatAt } from './map/mapCamera'
import { ScheduleStatus, scheduleNeedsAttention } from './ScheduleStatus'
import { stopDisplayName, stopModes, stopsWithLines } from './stopName'
import { TransitDepartureList } from './TransitDepartureList'
import { TransitFetchStatus } from './TransitFetchStatus'
import { LINE_KIND_LABEL, MODE_LABEL, MODE_ORDER } from './transitMode'
import { AccessibleIcon, AlertCircleIcon, CheckIcon, ChevronRightIcon, ICON_SIZE, MapIcon, SearchIcon } from './icons'
import { PinStar } from './PinStar'
import { BoardHeading } from './BoardHeading'
import { TabCrossfade } from './TabCrossfade'
import { useHeaderTitle } from './headerTitle'
import { InfoButton, InfoSection, InfoSheet, STICKY_TABS_BAR, useBoardContext } from './InfoSheet'
import { IconButton } from './IconButton'
import { StatTile } from './StatTile'
import { onTablistKeyDown } from './tablistKeys'
import { pluralPl } from '@/lib/plural'

type StopTab = 'departures' | 'alerts'
const STOP_TABS: { key: StopTab; label: string }[] = [
  { key: 'departures', label: 'Odjazdy' },
  { key: 'alerts', label: 'Komunikaty' },
]
const DEFAULT_TAB: StopTab = 'departures'
/** `?tab=` spoza listy ignorujemy po cichu (#4). */
const parseTab = (raw: string | null): StopTab => STOP_TABS.find((tab) => tab.key === raw)?.key ?? DEFAULT_TAB
/** Tyle odjazdów ZWRACA `/api/gtfs/board` maksymalnie (`MAX_LIMIT`) — prosimy o całość, bez cichego przycinania po stronie API. */
const SCHEDULE_FETCH_LIMIT = 50

/** Ikona pinu na mapie: pierwszy tryb wg priorytetu prezentacji (`MODE_ORDER`) obecny na przystanku. */
function primaryMode(lines: GtfsLine[]): GtfsMode {
  for (const mode of MODE_ORDER) {
    if (lines.some((l) => l.mode === mode)) return mode
  }
  return 'other'
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
  // Ten sam układ dla zakładki i filtra linii: `undefined` = idź za URL-em (`?tab=`, `?line=`), inaczej wybór usera.
  const [lineChoice, setLineChoice] = useState<string | null | undefined>(undefined)
  const [tabChoice, setTabChoice] = useState<StopTab | undefined>(undefined)
  const [requestedMember, setRequestedMember] = useState<string | null>(null)
  // Kontekst w kolumnie (`wide`) albo w arkuszu „Info” — jedno miejsce naraz, patrz `useBoardContext`.
  const { wide, infoOpen, toggleInfo, closeInfo } = useBoardContext()
  const tabIdBase = useId()
  const viewTabId = (tab: StopTab): string => `${tabIdBase}-tab-${tab}`
  const viewPanelId = `${tabIdBase}-panel`
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const activeTab = tabChoice ?? parseTab(searchParams.get('tab'))
  // `startTransition`: dopiero zmiana stanu w przejściu uruchamia crossfade (`TabCrossfade`). Zakładka i filtr
  // piszą do URL-a przez `replaceState` (bez żądania do serwera, bez wpisu w historii — `urlState.ts`).
  const selectTab = (tab: StopTab): void => {
    startTransition(() => setTabChoice(tab))
    patchUrlParams({ tab: tab === DEFAULT_TAB ? null : tab })
  }
  const selectLine = (routeId: string | null): void => {
    setLineChoice(routeId)
    patchUrlParams({ line: routeId })
  }
  // Zmiana miejsca (nie pierwszy render): stan poprzedniego przystanku — wybór przystanku, zakładka, filtr linii — nie przechodzi dalej.
  const placeKey = `${city}/${stopId}`
  const lastPlaceKey = useRef(placeKey)
  useEffect(() => {
    if (lastPlaceKey.current !== placeKey) {
      lastPlaceKey.current = placeKey
      patchUrlParams({ tab: null, line: null })
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberChoice(undefined)
    setRequestedMember(null)
    setTabChoice(undefined)
    setLineChoice(undefined)
  }, [placeKey])
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
  // `MapView` montuje mapę od nowa przy każdej zmianie `onPinClick` (Trap 2, `maps.md`) — a `selectMember` zmienia tożsamość razem
  // z URL-em, który sam zapisuje. Stały wrapper z ref-em: klik w pin nie niszczy własnego popupu.
  const selectMemberRef = useRef(selectMember)
  useEffect(() => {
    selectMemberRef.current = selectMember
  })
  const onPinClick = useCallback((id: string) => selectMemberRef.current(id), [])
  // Jeden widok odjazdów pokazuje pełną pobraną listę, do limitu API.
  const { data, error, loading, failed, lastSuccessAt, refresh } = useTransitBoard(city, [stopId], SCHEDULE_FETCH_LIMIT, effMember, true)
  // Nazwa miasta z `/api/cities` — jeden wspólny hook z `WeatherChip`,
  // `TransitStopCard` i stroną miasta (Task 9). Fallback do slugu, dopóki
  // lista się nie wczyta / gdy fetch zawiedzie.
  const { cities: cityEntries } = useCities()
  const cityName = cityEntries.find((entry) => entry.id === city)?.name ?? city
  const { isPinned, addPinned, removePinned, loaded: pinsLoaded } = usePinned()
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
  const titleMember = activeMember ?? (members.length === 1 ? members[0] : null)
  const displayTitle = titleMember === null ? stopName : stopDisplayName(stopName, titleMember.code ?? titleMember.platformCode)
  // Nazwa tablicy do nagłówka telefonu (przy przewijaniu); osadzona tablica ma własny nagłówek strony.
  useHeaderTitle(embedded ? null : displayTitle)
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
  // Klucz tekstowy zamiast tablicy: nowa tablica o tym samym składzie nie ma pisać do storage'u przy każdym odpytaniu.
  const recentModesKey = stopModes(board, recentMember ?? null).join(',')
  const recentName = activeMember !== null ? stopDisplayName(stopName, activeMember.code ?? activeMember.platformCode) : stopName
  useEffect(() => {
    if (!boardLoaded || !memberSettled) return
    const modes = recentModesKey === '' ? [] : (recentModesKey.split(',') as GtfsMode[])
    recordRecentPlace({ kind: 'gtfs', city, id: recentId, name: recentName, ...(recentMember !== undefined && { member: recentMember }), ...(modes.length > 0 && { modes }) })
  }, [boardLoaded, memberSettled, city, recentId, recentMember, recentName, recentModesKey, recordRecentPlace])

  // Zmiana przystanku w zespole zachowuje poprzednią odpowiedź (`keepPreviousData`: piny i geometria zespołu nie znikają), ale jej
  // odjazdy dotyczą INNEGO zakresu — dopóki `activeMember` odpowiedzi nie zgadza się z wyborem, lista jest „wczytywana"
  // (albo, gdy odświeżenie padło, „nie udało się pobrać"), nigdy odjazdami poprzedniego przystanku. Id spoza zespołu serwer ignoruje
  // (cały zespół) — sprawdzamy go na PEŁNEJ liście członków, żeby nieznany przystanek nie wisiał w ładowaniu.
  const expectedMember = effMember !== null && (board?.members ?? []).some((m) => m.id === effMember) ? effMember : null
  const scopeMismatch = board !== null && (board.activeMember ?? null) !== expectedMember
  const departuresLoading = loading || (scopeMismatch && error === null)
  const departuresFailed = failed || (scopeMismatch && error !== null)
  const boardRows = board === null || scopeMismatch ? [] : board.departures

  // Filtr z `?line=` ważny tylko, gdy ta linia jest na tablicy (`board.lines`); do wczytania tablicy — brak filtra.
  const rawUrlLine = searchParams.get('line')
  const urlLine = rawUrlLine !== null && GTFS_ROUTE_ID_PATTERN.test(rawUrlLine) ? rawUrlLine : null
  const requestedLine = lineChoice !== undefined ? lineChoice : urlLine
  const lineFilter = requestedLine !== null && (board?.lines ?? []).some((l) => l.routeId === requestedLine) ? requestedLine : null
  const filteredLine = lineFilter === null ? null : (board?.lines.find((l) => l.routeId === lineFilter) ?? null)
  const departures = lineFilter === null ? boardRows : boardRows.filter((d) => d.routeId === lineFilter)

  // Komunikaty: stan feedu z `alertFeed` (awaria ≠ pusto, `alertView.ts`); nieudane odświeżenie tablicy z ostatnią
  // listą = „nie udało się odświeżyć, pokazujemy ostatnie dane"; pierwszy fetch bez danych = „nie udało się wczytać".
  const alertList = board?.alerts ?? null
  const alertsView: ContextAlertsState =
    board === null
      ? { state: failed || error !== null ? 'failed' : 'loading', stale: false }
      : error !== null && alertList !== null
        ? { state: 'failed', stale: true }
        : toContextAlertsState(data?.alertFeed, alertList)
  const alertCount = alertList === null ? 0 : dedupeAlerts(alertList).length

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
  // Telefon: MapLibre (WebGL, worker, kafelki) startuje dopiero, gdy sekcja mapy zbliży się do ekranu — raz, bez odmontowania.
  const [phoneMapRef, phoneMapNear] = useNearViewport()
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

  // „Na mapie": współrzędne wybranego przystanku albo środek zespołu — z danych tablicy (zero GPS, zero zapytań). Bez przystanku
  // z lokalizacją linku nie ma (tekst zamiast martwej kontrolki).
  const located = activeMember !== null ? [activeMember] : members
  const mapHref =
    located.length === 0
      ? null
      : `/city/${city}/map?at=${formatAt({
          lat: located.reduce((sum, m) => sum + m.lat, 0) / located.length,
          lon: located.reduce((sum, m) => sum + m.lon, 0) / located.length,
          zoom: MAP_ZOOM.stops,
        })}`
  const mapLabel = members.length > 1 ? `Mapa zespołu przystanków ${stopName}` : `Mapa przystanku ${stopName}`

  const mapCard = mapPins.length > 0 && (
    <InfoSection title="Mapa" collapsible className="card-hover">
      <MapView pins={mapPins} onPinClick={onPinClick} ariaLabel={mapLabel} dark={resolvedTheme === 'dark'} />
    </InfoSection>
  )
  const trafficCard = (
    <InfoSection title="Natężenie ruchu dziś" collapsible className="card-hover">
      <HourlyTraffic
        hourly={summary?.hourly ?? null}
        loading={loading}
        currentHour={zonedHour(now, getCity(city)?.timezone ?? 'Europe/Warsaw')}
        emptyLabel={`Rozkład na dziś nie zawiera odjazdów z ${scopeGenitive}.`}
        unknownLabel={board !== null && board.summary === null ? 'Brak rozkładu na dziś.' : undefined}
      />
    </InfoSection>
  )
  const linesCard = (
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
                      <span className="text-xs text-text-muted">{LINE_KIND_LABEL[line.kind]}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AsideCard>
  )
  // Telefon (arkusz „Info”): linie → natężenie (zwinięte). Mapa stoi pod odjazdami w głównym przepływie (spec 04),
  // więc nie ma jej w arkuszu — jedno miejsce naraz (`ui-states.md`).
  const summaryTiles = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile uppercaseLabel label="Linie" value={summary ? String(summary.lineCount) : '—'} className="card-hover" />
      <StatTile uppercaseLabel label="Odjazdy dziś" value={summary ? String(summary.departuresToday) : '—'} hint="wg rozkładu" className="card-hover" />
      <StatTile
        uppercaseLabel
        label="Pierwszy / ostatni"
        value={
          summary && summary.firstDepartureSec !== null && summary.lastDepartureSec !== null
            ? `${formatSecondsOfDay(summary.firstDepartureSec)}–${formatSecondsOfDay(summary.lastDepartureSec)}`
            : '—'
        }
        className="card-hover"
      />
    </div>
  )
  const asideCards = wide ? (
    <>
      {summaryTiles}
      {mapCard}
      {trafficCard}
      {linesCard}
    </>
  ) : (
    <>
      {summaryTiles}
      {linesCard}
      {trafficCard}
    </>
  )

  const departuresEmpty = departuresFailed
    ? 'Nie udało się pobrać rozkładu.'
    : filteredLine !== null && boardRows.length > 0
      ? `Brak odjazdów linii ${filteredLine.line} wśród najbliższych ${SCHEDULE_FETCH_LIMIT} odjazdów.`
      : 'Brak kolejnych odjazdów w rozkładzie na dziś i jutro.'
  const timeZone = getCity(city)?.timezone ?? 'Europe/Warsaw'
  const refreshFailed = error !== null && board !== null
  const fetchStatus = <TransitFetchStatus sourceId={`gtfs-board:${city}:${stopId}`} sourceLabel={`Odjazdy — ${stopName}`} lastSuccessAt={lastSuccessAt ?? null} refreshFailed={refreshFailed} timeZone={timeZone} onRefresh={refresh} />
  const memberChipClass = (on: boolean): string =>
    `card-hover relative rounded-xl border px-3 py-2.5 text-left transition max-sm:min-h-11 max-sm:py-2 ${on ? 'border-primary bg-primary-soft text-primary-text ring-1 ring-primary' : 'border-surface-border'}`

  // Rozkład gotowy, a przystanku w nim nie ma (poprawny format id, nieznany w feedzie): nie „brak odjazdów”, tylko jasny komunikat + droga dalej.
  // `loading` zwraca `stops: [null]` już przy wczytywaniu rozkładu — to nie jest „nie znaleziono”.
  if (data !== null && data.schedule.state === 'ready' && board === null) {
    return (
      <section className="glass-strong rounded-2xl p-5 max-sm:p-4">
        <BoardHeading embedded={embedded} kind="gtfs" id={`${city}:${stopId}`}>
          {stopName}
        </BoardHeading>
        <p className="mt-2 text-sm text-text-secondary">Nie znaleziono przystanku</p>
        <Link href="/search" className="chip-filter mt-3 gap-1.5">
          <SearchIcon size={ICON_SIZE.button} />
          Szukaj przystanku
        </Link>
      </section>
    )
  }

  return (
    <div className="grid items-start gap-5 max-sm:gap-3 xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]">
      {/* Na telefonie odjazdy pierwsze: przystanki zespołu jako chipy, kontekst (pogoda, natężenie, linie) w arkuszu
          „Info”, mapa podglądowa dopiero pod odjazdami (04). */}
      <div className="flex min-w-0 flex-col gap-5 max-sm:gap-3">
        <section className="glass-strong rounded-2xl p-5 max-sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 max-sm:flex-nowrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BoardHeading embedded={embedded} kind="gtfs" id={`${city}:${board?.groupId ?? stopId}`}>
                  {displayTitle}
                </BoardHeading>
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
              {activeMember?.street != null && (
                <p className="mt-0.5 text-sm font-medium text-primary-text">
                  {activeMember.street}
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
                // Telefon: linijka stanu rozkładu tylko, gdy coś jest nie tak (ładowanie, awaria, stare dane) — oszczędza wysokość odjazdów.
                <div className={`mt-2 ${scheduleNeedsAttention(data.schedule, error !== null) ? '' : 'max-sm:hidden'}`}>
                  <ScheduleStatus compact schedule={data.schedule} cityName={cityName} error={error !== null} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IconButton
                label={pinned ? 'Odepnij ze Startu' : 'Przypnij do Startu'}
                onClick={() => (pinned ? removePinned(key) : addPinned(pinnedItem))}
                // Do pierwszej odpowiedzi nie wiadomo, czy widać zespół, czy jeden przystanek
                // (deep-link z linii zaznacza przystanek dopiero po niej) — przypięcie zapisałoby zły zakres.
                disabled={board === null}
              >
                <PinStar pinned={pinned} settled={pinsLoaded} size={ICON_SIZE.button} />
              </IconButton>
            </div>
          </div>

          {/* Telefon: „Na mapie” (z danych tablicy, bez GPS) i „Info” w jednym rzędzie; od `sm` kontekst stoi w kolumnie. */}
          {!wide && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {mapHref !== null ? (
                <Link href={mapHref} className="chip-filter gap-1.5">
                  <MapIcon size={ICON_SIZE.button} />
                  Na mapie
                </Link>
              ) : null}
              <InfoButton open={infoOpen} onClick={toggleInfo} />
            </div>
          )}
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
                className={`${memberChipClass(effMember === null)} text-xs`}
              >
                {effMember === null && (
                  <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-fg max-sm:hidden">
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
                    className={`${memberChipClass(on)} flex flex-col gap-1.5 max-sm:justify-center`}
                  >
                    {on && (
                      <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-fg max-sm:hidden">
                        <CheckIcon className="h-2.5 w-2.5" />
                      </span>
                    )}
                    {/* Jeden węzeł tekstowy jak dawniej — nazwa dostępna przycisku musi
                        zaczynać się dokładnie od "Centrum 02" (testy jednostkowe/e2e
                        odpytują ten prefiks przez `getByText`/`getByRole(...,{name})`,
                        które nie łączą tekstu rozbitego na sąsiednie elementy). */}
                    <span className="pr-5 font-heading text-base font-extrabold tabular-nums max-sm:pr-0 max-sm:text-sm">
                      {stopDisplayName(stopName, member.code ?? member.platformCode)}
                    </span>
                    {member.street !== null && <span className="text-xs text-text-muted max-sm:hidden">{member.street}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 max-sm:hidden">
                      {visibleLines.map((line) => (
                        <LineBadge key={line.routeId} line={line.line} mode={line.mode} kind={line.kind} size="sm" />
                      ))}
                      {overflow > 0 && <span className="text-xs text-text-muted">+{overflow}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Telefon: KPI w arkuszu „Info” (spec 04) — nad zakładkami nie ma miejsca na odjazdy. */}
        {/* SSR zakłada „szeroko”: `max-sm:hidden` chowa KPI na telefonie jeszcze przed hydracją (bez mignięcia kafelków). */}

        <section className="glass rounded-2xl p-5 max-sm:p-4">
          {/* Telefon: zakładki i filtr linii przyklejone pod nagłówkiem aplikacji. Zakładki to segment, który
              nie przewija się w bok: 4 w rzędzie, na wąskim ekranie (320 px) 2×2 w tej samej kolejności. */}
          <div
            data-testid="stop-tabs-bar"
            className={`mb-3 flex flex-col gap-2 ${STICKY_TABS_BAR}`}
          >
            <div
              role="tablist"
              aria-label="Widok przystanku"
              onKeyDown={(event) => onTablistKeyDown(event, STOP_TABS.findIndex((tab) => tab.key === activeTab), (index) => selectTab(STOP_TABS[index].key))}
              className="segment flex w-full flex-wrap sm:w-auto sm:self-start"
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
                  onClick={() => selectTab(tab.key)}
                  className="segment-item relative flex-auto gap-1.5 px-1 sm:px-4"
                >
                  {tab.label}
                  {/* Kropka zamiast ikony: 4 zakładki w jednym rzędzie nie mają miejsca na więcej szerokości; nazwę niesie sr-only. */}
                  {tab.key === 'alerts' && alertCount > 0 && (
                    <>
                      <span aria-hidden="true" className={`absolute right-1.5 top-2 h-2 w-2 rounded-full ${activeTab === tab.key ? 'bg-primary-fg' : 'bg-warning-text'}`} />
                      <span className="sr-only">{`, ${alertCount}`}</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'departures' && board !== null && board.lines.length > 1 && (
              <div role="group" aria-label="Filtr linii" className="flex flex-wrap items-center gap-1.5 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1">
                <button type="button" onClick={() => selectLine(null)} aria-pressed={lineFilter === null} className="chip-filter shrink-0">
                  Wszystkie
                </button>
                {board.lines.map((line) => (
                  <button
                    key={line.routeId}
                    type="button"
                    onClick={() => selectLine(lineFilter === line.routeId ? null : line.routeId)}
                    aria-pressed={lineFilter === line.routeId}
                    className="grid shrink-0 place-items-center rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-primary-text focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11 max-sm:min-w-11"
                  >
                    <LineBadge line={line.line} mode={line.mode} kind={line.kind} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div role="tabpanel" id={viewPanelId} aria-labelledby={viewTabId(activeTab)}>
            <TabCrossfade id={activeTab} name="stop-panel">
            {activeTab === 'departures' && (
              <>
                {/* Znane komunikaty: zwarty skrót nad odjazdami, szczegóły w zakładce „Komunikaty”. */}
                {activeTab === 'departures' && alertCount > 0 && (
                  <button
                    type="button"
                    onClick={() => selectTab('alerts')}
                    className="press flex min-h-11 w-full items-center gap-2 rounded-xl border border-warning-text bg-surface-strong px-3 text-left text-sm font-medium text-warning-text focus-visible:outline-2 focus-visible:outline-primary-text"
                  >
                    <AlertCircleIcon size={ICON_SIZE.button} />
                    <span className="min-w-0 flex-1">{`${alertCount} ${pluralPl(alertCount, 'komunikat', 'komunikaty', 'komunikatów')}`}</span>
                    <ChevronRightIcon size={ICON_SIZE.button} />
                  </button>
                )}
                {refreshFailed && fetchStatus}
                <TransitDepartureList
                  departures={departures}
                  loading={departuresLoading}
                  emptyMessage={departuresEmpty}
                  emptyAction={
                    lineFilter !== null && !departuresFailed && boardRows.length > 0 ? (
                      <button type="button" onClick={() => selectLine(null)} className="chip-filter mt-3">
                        Wszystkie linie
                      </button>
                    ) : undefined
                  }
                  city={city}
                  returnTo={`${pathname}?${searchParams}`}
                  showStopCode={activeMember === null && members.length > 1}
                  now={now}
                  fetchedAt={lastSuccessAt}
                />
                {/* „Pobrano …” pod listą (nie nad nią: odjazdy pierwsze); ostrzeżenie o nieudanym odświeżeniu zostaje nad listą. */}
                {!refreshFailed && fetchStatus}
              </>
            )}

            {activeTab === 'alerts' && (
              <ContextAlerts
                alerts={alertList}
                state={alertsView.state}
                stale={alertsView.stale}
                // Przed odpowiedzią nie wiadomo, czy to zespół, czy przystanek — nazwa neutralna.
                scopeLabel={board === null ? 'Komunikaty' : wholeGroup ? 'Komunikaty linii obsługujących ten zespół' : 'Komunikaty linii obsługujących ten przystanek'}
              />
            )}
            </TabCrossfade>
          </div>
        </section>

        {/* Telefon: mapa podglądowa (≤ 180 px) dopiero pod odjazdami; od `sm` mapa jest w kolumnie. Bez lokalizacji — opis zamiast pustego prostokąta. */}
        {!wide && board !== null && (
          <section ref={phoneMapRef} aria-labelledby={`${tabIdBase}-map`} className="glass rounded-2xl p-3">
            <h2 id={`${tabIdBase}-map`} className="mb-2 text-sm font-semibold text-text-secondary">
              Lokalizacja przystanku
            </h2>
            {mapPins.length === 0 ? (
              <p className="text-sm text-text-secondary">Brak lokalizacji przystanku</p>
            ) : phoneMapNear ? (
              <MapView pins={mapPins} onPinClick={onPinClick} ariaLabel={mapLabel} dark={resolvedTheme === 'dark'} compact />
            ) : (
              // Rezerwa wysokości = `compact` MapView (h-44), żeby wejście mapy nie przesuwało układu.
              <div className="h-44" aria-hidden="true" />
            )}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
        {/* Telefon: karty są w arkuszu „Info”; licencja danych zostaje widoczna pod tablicą. */}
        {wide && <div className="contents max-sm:hidden">{asideCards}</div>}
        <AttributionFooter attribution={data?.attribution ?? []} />
      </aside>

      {infoOpen && (
        <InfoSheet title="Informacje o przystanku" onClose={closeInfo}>
          {asideCards}
        </InfoSheet>
      )}
    </div>
  )
}
