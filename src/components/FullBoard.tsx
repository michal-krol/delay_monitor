'use client'

import { startTransition, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useBoard } from '@/hooks/useBoard'
import { useStationWeather } from '@/hooks/useStationWeather'
import { useRecentPlaces } from '@/hooks/useRecentPlaces'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardStatus } from './BoardStatus'
import { BoardTable, StatusLegend } from './BoardTable'
import { ActionGrid } from './ActionGrid'
import { BoardMoreMenu } from './BoardMoreMenu'
import { DirectionSelect } from './DirectionSelect'
import { InfoButton, InfoSheet, STICKY_TABS_BAR, useBoardContext } from './InfoSheet'
import { PopularDestinations, StationAside } from './StationAside'
import { StationStatsCards } from './StationStatsCards'
import { StationThumb } from './StationThumb'
import { BoardHeading } from './BoardHeading'
import { TabCrossfade } from './TabCrossfade'
import { useHeaderTitle } from './headerTitle'
import { AlertCircleIcon, ArrowLeftIcon, ChevronRightIcon, CloseIcon, MapIcon, ICON_SIZE } from './icons'
import { PinStar } from './PinStar'
import { ICON_BUTTON_CLASS, IconButton } from './IconButton'
import { MAP_ZOOM, formatAt } from './map/mapData'
import { useRailStations } from '@/hooks/useRailStations'
import { useCityContext } from '@/hooks/useCityContext'
import { pluralPl } from '@/lib/plural'
import type { MapRailStation } from '@/lib/weather/coordinates'
import { NAV_BACK_TYPES } from '@/lib/navTransition'
import { onTablistKeyDown } from './tablistKeys'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { formatClockTime } from '@/lib/format'
import { zonedHour } from '@/lib/pkp/time'

type Props = {
  stationId: string
  stationName: string
  isPinned: boolean
  /** Przypięcia wczytane z `localStorage` (`usePinned().loaded`) — przed tym gwiazdka nie „puka” (`PinStar`). */
  pinsLoaded?: boolean
  onTogglePin: () => void
  /**
   * Osadzone pod wyszukiwarką na ekranie miasta, które ma już własny h1 —
   * nazwa stacji jest wtedy h2. Wyjście, motyw i „Udostępnij" rysuje zawsze
   * strona nadrzędna (`TopBar`), nie tablica.
   */
  embedded?: boolean
  /**
   * Telefon: górny rząd karty to ← nazwa ★ ⋮ („Więcej”: „Udostępnij”, „Informacje o stacji”) zamiast osobnego
   * wiersza `TopBar` (strona chowa go `hideOnPhone`) — nazwa (h1, `PlaceTitle`) stoi raz. Tylko gdy `!embedded`.
   */
  phoneBack?: { href: string; label: string }
}

export type Direction = 'departures' | 'arrivals'

/** Sufit długości filtra kierunku odtwarzanego z URL-a -- patrz komentarz przy odczycie. */
const MAX_DESTINATION_FILTER_LENGTH = 100

const DIRECTIONS: Direction[] = ['departures', 'arrivals']

/** Zakładki Odjazdy/Przyjazdy; `tabIndex` roving — Tab wchodzi tylko na aktywną, strzałki przełączają. */
function TabButton({
  id,
  panelId,
  active,
  onClick,
  children,
}: {
  id: string
  panelId: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      // Wspólny segment (F0): aktywny wygląd daje `aria-selected`; na telefonie dzielą szerokość po równo.
      className="segment-item flex-1 sm:flex-none"
    >
      {children}
    </button>
  )
}

/** Co „Na mapie” może zrobić: jeszcze nie wiadomo / nie ma lokalizacji / jest link. Czysta decyzja, bez DOM. */
export type StationMapLink = { state: 'loading' } | { state: 'failed' } | { state: 'unavailable' } | { state: 'ready'; href: string; lat: number; lon: number }

/**
 * Link „Na mapie” z statycznej listy stacji kolei (`useRailStations`, 0 PKP — AGENTS.md #3), nie z pogody.
 * Znane miasto → mapa miasta, inaczej `/map` (przekierowanie gubi dziś `?at=` — naprawia osobny PR).
 * Lista się wczytuje (`null` bez błędu) = „jeszcze nie wiadomo”; błąd listy = „nie udało się”; stacji nie ma na liście = brak lokalizacji.
 */
export function stationMapLink(rail: { stations: MapRailStation[] | null; error: boolean }, stationId: string, city: string | null): StationMapLink {
  const station = rail.stations?.find((s) => s.id === stationId)
  if (station === undefined) {
    if (rail.stations !== null) return { state: 'unavailable' }
    return rail.error ? { state: 'failed' } : { state: 'loading' }
  }
  const at = formatAt({ lat: station.lat, lon: station.lon, zoom: MAP_ZOOM.stops })
  return { state: 'ready', href: `${city === null ? '' : `/city/${city}`}/map?at=${at}`, lat: station.lat, lon: station.lon }
}

/** Telefon: rząd w karcie nagłówka. Ładowanie = nic (ani sterowanie, ani „wyłączony” napis); brak lokalizacji = zwykły tekst, nie kontrolka. */
function StationMapRow({ link }: { link: StationMapLink }) {
  // Ładowanie: puste miejsce o wysokości rzędu, żeby po wczytaniu listy tablica nie zjechała w dół.
  if (link.state === 'loading') return <div className="mt-2 min-h-11" aria-hidden="true" />
  return (
    <div className="mt-2">
      {link.state === 'ready' ? (
        <Link href={link.href} className="chip-filter gap-1.5">
          <MapIcon size={ICON_SIZE.button} />
          Na mapie
        </Link>
      ) : (
        <p className="text-sm text-text-secondary">{link.state === 'failed' ? 'Nie udało się wczytać lokalizacji stacji' : 'Brak lokalizacji stacji'}</p>
      )}
    </div>
  )
}

/** Telefon: zwarty komunikat o utrudnieniach na stacji; otwiera arkusz „Info” (treść źródłowa PKP, sekcja na górze). */
function DisruptionNotice({ count, open, onOpen }: { count: number; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      // Safari nie fokusuje przycisku po kliknięciu — bez tego arkusz nie miałby dokąd oddać fokusu.
      onClick={(event) => {
        event.currentTarget.focus()
        onOpen()
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={`press flex min-h-11 w-full items-center gap-2 rounded-xl border border-warning-text bg-surface-strong px-3 text-left text-sm font-medium text-warning-text focus-visible:outline-2 focus-visible:outline-primary-text`}
    >
      <AlertCircleIcon size={ICON_SIZE.button} />
      <span className="min-w-0 flex-1">{`${count} ${pluralPl(count, 'utrudnienie', 'utrudnienia', 'utrudnień')} na stacji`}</span>
      <ChevronRightIcon size={ICON_SIZE.button} />
    </button>
  )
}

export function FullBoard({ stationId, stationName, isPinned, pinsLoaded = true, onTogglePin, embedded = false, phoneBack }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  // Nazwa tablicy do nagłówka telefonu (przy przewijaniu); osadzona tablica ma własny nagłówek strony.
  useHeaderTitle(embedded ? null : stationName)
  const idBase = useId()
  const tabId = (d: Direction): string => `${idBase}-tab-${d}`
  const panelId = `${idBase}-panel`
  /** Filtr kierunku z prawej kolumny — nazwa stacji końcowej albo `null`. */
  const [destinationFilter, setDestinationFilter] = useState<string | null>(null)
  // Kontekst w kolumnie (`wide`) albo w arkuszu „Info” — jedno miejsce naraz, patrz `useBoardContext`.
  const { wide, infoOpen, toggleInfo, openInfo, closeInfo } = useBoardContext()
  const { data, error, lastSuccessAt, refresh } = useBoard([stationId])
  const weather = useStationWeather(stationId)
  const snapshot = data?.snapshots[0] ?? null
  const configError = data?.status === 'configError'

  // „Ostatnio oglądane": zapis po wczytaniu snapshotu, zależny od wartości (nie od obiektu
  // snapshotu, który zmienia się co odpytanie). Zapisujemy nazwę rozwiązaną przez serwer, nie
  // `?name=` z URL-a (wpis powstaje bez kliknięcia, więc nie może nieść cudzego tekstu z linku).
  // Nazwa równa id = serwer nie znał nazwy — nic do pokazania.
  const { record: recordRecentPlace } = useRecentPlaces()
  const resolvedName = snapshot?.stationName ?? null
  useEffect(() => {
    if (resolvedName !== null && resolvedName !== stationId) recordRecentPlace({ kind: 'pkp', id: stationId, name: resolvedName })
  }, [resolvedName, stationId, recordRecentPlace])

  const now = useSnapshotNow(data)

  /**
   * Zmiana kierunku czyści filtr: „najpopularniejsze kierunki" liczą się z
   * ODJAZDÓW, więc ten sam filtr na tablicy przyjazdów dawałby pustą listę
   * bez czytelnego powodu. Czyszczone wprost w handlerze, nie efektem na
   * `direction` -- efekt ustawiający stan po zmianie innego stanu to zawsze
   * dodatkowy render i renderowanie odfiltrowanej tablicy przez jedną klatkę.
   */
  function switchDirection(next: Direction): void {
    // `startTransition`: dopiero zmiana stanu w przejściu uruchamia crossfade (`TabCrossfade`).
    startTransition(() => {
      setDirection(next)
      setDestinationFilter(null)
    })
  }

  const allRows = useMemo(() => (snapshot ? snapshot[direction] : []), [snapshot, direction])
  const rows = useMemo(
    () => (destinationFilter === null ? allRows : allRows.filter((row) => row.headsign === destinationFilter)),
    [allRows, destinationFilter]
  )

  // Popup powiększonej mapy (`MapView.tsx`) — zawsze ODJAZDY, niezależnie od
  // aktywnej zakładki Odjazdy/Przyjazdy (podgląd na mapie to zawsze „skąd
  // wyjadę"). Dane już mamy w snapshocie, zero nowego zapytania.
  const mapPreview = useMemo(
    () =>
      (snapshot?.departures ?? [])
        .slice()
        .sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime())
        .slice(0, 2)
        .map((row) => `${formatClockTime(row.plannedAt)} → ${row.headsign ?? row.trainLabel}`),
    [snapshot]
  )

  // Odtworzenie zakładki z linku — raz, po zamontowaniu (patrz identyczny
  // wzorzec i uzasadnienie w page.tsx). Nieprawidłowy/uszkodzony parametr jest
  // po prostu ignorowany. Szczegóły połączenia mają teraz własną trasę
  // (`/connection/...`) z własnym adresem — nie ma już czego odtwarzać tutaj.
  // `restoredRef`: StrictMode (dev) odpala efekty dwa razy, a między nimi efekt zapisu poniżej nadpisuje URL stanem
  // domyślnym — drugie czytanie widziałoby już `tab=departures` i gubiło link. Stan z pierwszego przebiegu zostaje.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const tab = readUrlParam('tab')
    if (tab === 'departures' || tab === 'arrivals') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu
      setDirection(tab)
    }
    // Filtr kierunku jest wprost porównywany z `headsign` wiersza, więc żadna
    // wartość z URL-a nie jest niebezpieczna: nieznana nazwa po prostu nie
    // pasuje do niczego i tablica wychodzi pusta. Przycinamy jednak długość,
    // żeby spreparowany link nie wstrzyknął kilobajta tekstu do plakietki
    // filtra (AGENTS.md #4: wejście spoza aplikacji jest zawsze wrogie).
    const destination = readUrlParam('direction')
    if (destination !== null && destination !== '' && destination.length <= MAX_DESTINATION_FILTER_LENGTH) {
      setDestinationFilter(destination)
    }
  }, [])

  // Zapis do URL-a przy każdej zmianie — `replaceState`, nie `pushState`
  // (patrz urlState.ts): zwykłe przełączanie zakładki nie ma zaśmiecać
  // historii cofania przeglądarki.
  useEffect(() => {
    patchUrlParams({ tab: direction })
  }, [direction])

  // Filtr kierunku w adresie, żeby „Warszawa Zachodnia → Kraków" dało się
  // komuś wysłać. Ten sam `replaceState` co `tab` -- filtrowanie listy nie ma
  // zaśmiecać historii cofania.
  useEffect(() => {
    patchUrlParams({ direction: destinationFilter })
  }, [destinationFilter])

  // Brak sprzątania `tab`/`direction` przy odmontowaniu: wstecz z `/connection/…` wraca do wpisu historii, w którego
  // URL-u już są (zapisane wyżej przez `replaceState`). Sprzątanie biegnie PO zmianie adresu, więc wycinałoby je
  // dopiero z NASTĘPNEJ strony (np. `?tab=` przystanku). Nowe stacje otwiera się świeżym linkiem — nic nie dziedziczą.

  const loading = snapshot === null && error === null

  // Współrzędne stacji z listy stacji kolei (statyczna, 0 PKP) — dla „Na mapie” i pinu w aside; niezależne od pogody.
  const rail = useRailStations()
  const { city } = useCityContext()
  const mapLink = stationMapLink(rail, stationId, city)
  const lat = mapLink.state === 'ready' ? mapLink.lat : null
  const lon = mapLink.state === 'ready' ? mapLink.lon : null
  const location = useMemo(() => (lat === null || lon === null ? null : { lat, lon }), [lat, lon])
  const disruptionCount = snapshot?.disruptionMessages?.length ?? 0
  const aside = (
    <StationAside
      insights={snapshot?.insights}
      disruptionMessages={snapshot?.disruptionMessages ?? []}
      destinationFilter={destinationFilter}
      onDestinationFilter={setDestinationFilter}
      loading={loading}
      currentHour={zonedHour(now, 'Europe/Warsaw')}
      weather={weather}
      stationName={stationName}
      stationId={stationId}
      location={location}
      mapPreview={mapPreview}
      stats={snapshot?.stats}
    />
  )

  // Wiek danych: jedno miejsce naraz. Przy błędzie konfiguracji NIE pokazujemy statusu danych --
  // „Ostatnia aktualizacja: …" obok banera „sprawdź klucz API" to dokładnie to mieszanie sygnałów,
  // przed którym ostrzega AGENTS.md #7. Ta sama zasada co ukrycie tabeli niżej.
  const status = configError ? null : (
    <BoardStatus fetchedAt={snapshot?.fetchedAt} ageMs={snapshot?.ageMs} lastSuccessAt={lastSuccessAt} data={data} error={error !== null} onRefresh={refresh} />
  )

  return (
    <div className="grid items-start gap-5 max-sm:gap-2 xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]">
      {/* Telefon, kolejno (spec 02): karta nagłówka z „Na mapie” → powiadomienie o utrudnieniach → sekcja tablicy
          (zakładki → filtr kierunku → wiek danych → wiersze). KPI, pogoda, ruch i legenda tylko w arkuszu „Info”. */}
      <div className="flex min-w-0 flex-col gap-5 max-sm:gap-2">
        <section className="glass relative rounded-2xl p-5 max-sm:p-3">
          {configError && <ConfigErrorBanner />}

          <div className="flex flex-wrap items-start justify-between gap-4 max-sm:flex-nowrap max-sm:items-center max-sm:gap-2">
            <div className="flex min-w-0 items-center gap-4 max-sm:gap-2">
              {phoneBack !== undefined && !wide && (
                <Link href={phoneBack.href} transitionTypes={NAV_BACK_TYPES} aria-label={phoneBack.label} className={`${ICON_BUTTON_CLASS} h-11 w-11`}>
                  <ArrowLeftIcon size={ICON_SIZE.button} />
                </Link>
              )}
              <div className="shrink-0 max-sm:hidden">
                <StationThumb stationName={stationName} />
              </div>
              <div className="min-w-0">
                {/* Nazwany element przejścia z kafelka Pulpitu; osadzona tablica (ekran miasta) nie przychodzi z Pulpitu. */}
                <BoardHeading className="max-sm:line-clamp-2 max-sm:text-lg max-sm:leading-tight" embedded={embedded} kind="pkp" id={stationId}>
                  {stationName}
                </BoardHeading>
                {/* Od `sm` wiek danych pod tytułem; na telefonie stoi nad wierszami (niżej). */}
                {wide && status !== null && <div className="mt-1">{status}</div>}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <IconButton onClick={onTogglePin} label={isPinned ? 'Odepnij ze Startu' : 'Przypnij do Startu'} className="max-sm:h-11 max-sm:w-11">
                <PinStar pinned={isPinned} settled={pinsLoaded} size={ICON_SIZE.button} />
              </IconButton>
              {phoneBack !== undefined && !wide && <BoardMoreMenu infoLabel="Informacje o stacji" onInfo={openInfo} />}
            </div>
          </div>

          {!wide && <StationMapRow link={mapLink} />}
        </section>

        {/* Telefon: zwarty komunikat o utrudnieniach nad zakładkami (D2); od `sm` te same komunikaty stoją w aside. */}
        {!configError && !wide && disruptionCount > 0 && <DisruptionNotice count={disruptionCount} open={infoOpen} onOpen={openInfo} />}

        {/* Baner z błędem konfiguracji nie ma slotu na przycisk, więc nie może
            całkowicie zastąpić widoku (jak robi StationCard) — FullBoard jest
            jedynym widokiem na ekranie i użytkownik musiałby stąd wyjść. Ukrywamy
            więc tylko zależne od danych kafelki/zakładki/tabelę, żeby baner
            "sprawdź klucz API" nie sąsiadował z wyglądającą na działającą tabelą. */}
        {!configError && (
          <>
            {/* Telefon: kafelki tylko w arkuszu „Info”. */}
            {wide && (
              <div className="max-sm:hidden">
                <StationStatsCards stats={snapshot?.stats} loading={loading} />
              </div>
            )}

            <section className="glass rounded-2xl p-5 max-sm:p-4">
              {/* Na telefonie pasek przykleja się pod nagłówkiem aplikacji: zakładki, legenda i „Info”
                  zostają pod ręką przy przewijaniu długiej tablicy. Nieprzezroczysty, bo wiersze jadą pod nim. */}
              <ActionGrid
                cols={3}
                testId="board-tabs-bar"
                className={`sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 ${STICKY_TABS_BAR}`}
              >
                <div
                  role="tablist"
                  aria-label="Kierunek"
                  onKeyDown={(event) => onTablistKeyDown(event, DIRECTIONS.indexOf(direction), (index) => switchDirection(DIRECTIONS[index]))}
                  className="segment max-sm:col-span-2"
                >
                  <TabButton id={tabId('departures')} panelId={panelId} active={direction === 'departures'} onClick={() => switchDirection('departures')}>
                    Odjazdy
                  </TabButton>
                  <TabButton id={tabId('arrivals')} panelId={panelId} active={direction === 'arrivals'} onClick={() => switchDirection('arrivals')}>
                    Przyjazdy
                  </TabButton>
                </div>
                {wide && <StatusLegend />}

                {/* Telefon: wybrany kierunek pokazuje selektor pod zakładkami. */}
                {destinationFilter !== null && wide && (
                  <button
                    type="button"
                    data-active=""
                    onClick={() => setDestinationFilter(null)}
                    className="chip-filter gap-1.5"
                  >
                    Kierunek: {destinationFilter}
                    <CloseIcon size={ICON_SIZE.chip} />
                  </button>
                )}
                <div className="max-sm:[&>button]:w-full sm:ml-auto">
                  <InfoButton open={infoOpen} onClick={toggleInfo} />
                </div>
              </ActionGrid>

              {/* Telefon: filtr kierunku (`DirectionSelect`) tuż pod zakładkami, potem wiek danych — kolejność ze spec 02.
                  Chipy kosztowały ~55 px, więc selektor zastępuje je na telefonie. */}
              {!wide && (
                <div className="mt-2">
                  <DirectionSelect direction={direction} rows={allRows} value={destinationFilter} onChange={setDestinationFilter} />
                </div>
              )}
              {!wide && status !== null && <div className="mt-2">{status}</div>}

              {/* Od `sm` do `xl` kierunki są filtrami nad tablicą (ten sam stan co karta w kolumnie od `xl`). */}
              {direction === 'departures' && wide && (
                <PopularDestinations variant="chips" insights={snapshot?.insights} loading={false} onSelect={setDestinationFilter} selected={destinationFilter} />
              )}

              <div role="tabpanel" id={panelId} aria-labelledby={tabId(direction)}>
                <TabCrossfade id={direction} name="board-rows">
                  <BoardTable
                    stationName={stationName}
                    direction={direction}
                    rows={rows}
                    now={now}
                    loading={loading}
                  />
                </TabCrossfade>
              </div>
            </section>
          </>
        )}
      </div>

      {!configError && wide && (
        <aside className="max-sm:hidden xl:sticky xl:top-6 xl:max-h-[calc(100dvh_-_3rem)] xl:overflow-y-auto">{aside}</aside>
      )}

      {/* Telefon: te same komponenty co prawa kolumna (jedna implementacja), w układzie arkusza (`useInInfoSheet`). */}
      {!configError && infoOpen && (
        <InfoSheet title="Informacje o stacji" onClose={closeInfo}>
          {aside}
        </InfoSheet>
      )}
    </div>
  )
}
