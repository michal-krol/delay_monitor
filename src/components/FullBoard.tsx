'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { useStationWeather } from '@/hooks/useStationWeather'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardStatus } from './BoardStatus'
import { BoardTable } from './BoardTable'
import { StationAside } from './StationAside'
import { StationStatsCards } from './StationStatsCards'
import { StationThumb } from './StationThumb'
import { PageTitle } from './PageTitle'
import { CloseIcon, PIN_COLOR, StarIcon, ICON_SIZE } from './icons'
import { IconButton } from './IconButton'
import { onTablistKeyDown } from './tablistKeys'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { formatClockTime } from '@/lib/format'
import { zonedHour } from '@/lib/pkp/time'

type Props = {
  stationId: string
  stationName: string
  isPinned: boolean
  onTogglePin: () => void
  /**
   * Osadzone pod wyszukiwarką na ekranie miasta, które ma już własny h1 —
   * nazwa stacji jest wtedy h2. Wyjście, motyw i „Udostępnij" rysuje zawsze
   * strona nadrzędna (`TopBar`), nie tablica.
   */
  embedded?: boolean
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
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? 'text-white shadow-sm' : 'text-text-secondary hover:text-foreground'
      }`}
      // Ten sam akcent co zakładki przystanku (TransitStopDetail) — stacja wygląda jak przystanek.
      style={active ? { background: 'var(--accent-gradient)' } : undefined}
    >
      {children}
    </button>
  )
}

export function FullBoard({ stationId, stationName, isPinned, onTogglePin, embedded = false }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  const idBase = useId()
  const tabId = (d: Direction): string => `${idBase}-tab-${d}`
  const panelId = `${idBase}-panel`
  /** Filtr kierunku z prawej kolumny — nazwa stacji końcowej albo `null`. */
  const [destinationFilter, setDestinationFilter] = useState<string | null>(null)
  const { data, error, lastSuccessAt } = useBoard([stationId])
  const weather = useStationWeather(stationId)
  const snapshot = data?.snapshots[0] ?? null
  const configError = data?.status === 'configError'

  const now = useSnapshotNow(data)

  /**
   * Zmiana kierunku czyści filtr: „najpopularniejsze kierunki" liczą się z
   * ODJAZDÓW, więc ten sam filtr na tablicy przyjazdów dawałby pustą listę
   * bez czytelnego powodu. Czyszczone wprost w handlerze, nie efektem na
   * `direction` -- efekt ustawiający stan po zmianie innego stanu to zawsze
   * dodatkowy render i renderowanie odfiltrowanej tablicy przez jedną klatkę.
   */
  function switchDirection(next: Direction): void {
    setDirection(next)
    setDestinationFilter(null)
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
  useEffect(() => {
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

  // Zamknięcie całej tablicy (powrót do dashboardu) musi wyczyścić `tab` —
  // inaczej otwarcie kolejnej, innej stacji odziedziczyłoby zakładkę sprzed
  // zamknięcia, przez wciąż obecny w URL-u wpis.
  useEffect(() => {
    return () => {
      patchUrlParams({ tab: null, direction: null })
    }
  }, [])

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-2xl p-5">
          {configError && <ConfigErrorBanner />}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <StationThumb stationName={stationName} />
              <div className="min-w-0">
                <PageTitle as={embedded ? 'h2' : 'h1'}>{stationName}</PageTitle>
                {/* Przy błędzie konfiguracji NIE pokazujemy statusu danych --
                    „Ostatnia aktualizacja: …" obok banera „sprawdź klucz API"
                    to dokładnie to mieszanie sygnałów, przed którym ostrzega
                    AGENTS.md #7. Ta sama zasada co ukrycie tabeli niżej. */}
                {!configError && (
                  <div className="mt-1">
                    <BoardStatus fetchedAt={snapshot?.fetchedAt} ageMs={snapshot?.ageMs} lastSuccessAt={lastSuccessAt} data={data} error={error !== null} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IconButton onClick={onTogglePin} label={isPinned ? 'Odepnij z Pulpitu' : 'Przypnij do Pulpitu'}>
                <StarIcon size={ICON_SIZE.button} filled={isPinned} className={isPinned ? PIN_COLOR : ''} />
              </IconButton>
            </div>
          </div>
        </section>

        {/* Baner z błędem konfiguracji nie ma slotu na przycisk, więc nie może
            całkowicie zastąpić widoku (jak robi StationCard) — FullBoard jest
            jedynym widokiem na ekranie i użytkownik musiałby stąd wyjść. Ukrywamy
            więc tylko zależne od danych kafelki/zakładki/tabelę, żeby baner
            "sprawdź klucz API" nie sąsiadował z wyglądającą na działającą tabelą. */}
        {!configError && (
          <>
            <StationStatsCards stats={snapshot?.stats} loading={snapshot === null && error === null} />

            <section className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Kierunek"
                  onKeyDown={(event) => onTablistKeyDown(event, DIRECTIONS.indexOf(direction), (index) => switchDirection(DIRECTIONS[index]))}
                  className="inline-flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5"
                >
                  <TabButton id={tabId('departures')} panelId={panelId} active={direction === 'departures'} onClick={() => switchDirection('departures')}>
                    Odjazdy
                  </TabButton>
                  <TabButton id={tabId('arrivals')} panelId={panelId} active={direction === 'arrivals'} onClick={() => switchDirection('arrivals')}>
                    Przyjazdy
                  </TabButton>
                </div>

                {destinationFilter !== null && (
                  <button
                    type="button"
                    onClick={() => setDestinationFilter(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1 text-xs text-text-secondary transition hover:text-foreground"
                  >
                    Kierunek: {destinationFilter}
                    <CloseIcon size={ICON_SIZE.chip} />
                  </button>
                )}
              </div>

              <div role="tabpanel" id={panelId} aria-labelledby={tabId(direction)}>
                <BoardTable
                  stationName={stationName}
                  direction={direction}
                  rows={rows}
                  now={now}
                  loading={snapshot === null && error === null}
                />
              </div>
            </section>
          </>
        )}
      </div>

      {!configError && (
        <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100dvh_-_3rem)] xl:overflow-y-auto">
          <StationAside
            insights={snapshot?.insights}
            disruptionMessages={snapshot?.disruptionMessages ?? []}
            destinationFilter={destinationFilter}
            onDestinationFilter={setDestinationFilter}
            loading={snapshot === null && error === null}
            currentHour={zonedHour(now, 'Europe/Warsaw')}
            weather={weather}
            stationName={stationName}
            stationId={stationId}
            mapPreview={mapPreview}
          />
        </aside>
      )}
    </div>
  )
}
