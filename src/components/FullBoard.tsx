'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { useStationWeather } from '@/hooks/useStationWeather'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardStatus } from './BoardStatus'
import { BoardTable } from './BoardTable'
import { StationAside } from './StationAside'
import { StationStatsCards } from './StationStatsCards'
import { StationThumb } from './StationThumb'
import { ThemeToggle } from './ThemeToggle'
import { CloseIcon, ShareIcon, StarIcon } from './icons'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'
import { useShareUrl } from '@/hooks/useShareUrl'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
  /**
   * Osadzone pod wyszukiwarką na ekranie miasta — przycisk „wstecz" i
   * `ThemeToggle` rysuje wtedy ekran nadrzędny, więc wewnętrzny „✕" znika.
   */
  embedded?: boolean
}

export type Direction = 'departures' | 'arrivals'

/** Sufit długości filtra kierunku odtwarzanego z URL-a -- patrz komentarz przy odczycie. */
const MAX_DESTINATION_FILTER_LENGTH = 100

/**
 * Przycisk-ikona bez podpisu — ten sam krój co `ThemeToggle` (obok którego
 * zawsze stoi w tym samym rzędzie), żeby wszystkie przyciski nagłówka
 * wyglądały spójnie. Eksportowany do reużycia w `FocusedStation`.
 */
export function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      style={{ borderColor: 'var(--surface-border)' }}
    >
      {children}
    </button>
  )
}

/** Eksportowany do reużycia w `FocusedStation` — te same zakładki Odjazdy/Przyjazdy. */
export function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-secondary hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose, embedded = false }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  /** Filtr kierunku z prawej kolumny — nazwa stacji końcowej albo `null`. */
  const [destinationFilter, setDestinationFilter] = useState<string | null>(null)
  const { share, status: shareStatus } = useShareUrl()
  const { data, error } = useBoard([stationId])
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

  // Odtworzenie zakładki z linku — raz, po zamontowaniu (patrz identyczny
  // wzorzec i uzasadnienie w page.tsx). Nieprawidłowy/uszkodzony parametr jest
  // po prostu ignorowany. Szczegóły połączenia mają teraz własną trasę
  // (`/polaczenie/...`) z własnym adresem — nie ma już czego odtwarzać tutaj.
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
    const destination = readUrlParam('kierunek')
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
    patchUrlParams({ kierunek: destinationFilter })
  }, [destinationFilter])

  // Zamknięcie całej tablicy (powrót do dashboardu) musi wyczyścić `tab` —
  // inaczej otwarcie kolejnej, innej stacji odziedziczyłoby zakładkę sprzed
  // zamknięcia, przez wciąż obecny w URL-u wpis.
  useEffect(() => {
    return () => {
      patchUrlParams({ tab: null, kierunek: null })
    }
  }, [])

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="glass rounded-2xl p-5">
          {configError && <ConfigErrorBanner />}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <StationThumb stationName={stationName} />
              <div className="min-w-0">
                <h2 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{stationName}</h2>
                {/* Przy błędzie konfiguracji NIE pokazujemy statusu danych --
                    „Ostatnia aktualizacja: …" obok banera „sprawdź klucz API"
                    to dokładnie to mieszanie sygnałów, przed którym ostrzega
                    AGENTS.md #7. Ta sama zasada co ukrycie tabeli niżej. */}
                {!configError && (
                  <div className="mt-1">
                    <BoardStatus fetchedAt={snapshot?.fetchedAt} ageMs={snapshot?.ageMs} data={data} error={error !== null} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {shareStatus !== 'idle' && (
                <span role="status" className="text-sm text-text-secondary">
                  {shareStatus === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
                </span>
              )}
              <IconButton onClick={onToggleFavourite} label={isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
                <StarIcon size={15} className={isFavourite ? 'fill-current text-amber-400' : ''} />
              </IconButton>
              {/* Przycisk z podpisem, nie sama ikona (makieta §17) -- to
                  główna akcja nagłówka, a „Udostępnij" bez etykiety było
                  najmniej odgadywalnym elementem tego widoku. */}
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                <ShareIcon size={15} />
                Udostępnij
              </button>
              {/* Osadzone: przycisk „wstecz" i motyw rysuje ekran nadrzędny. */}
              {!embedded && (
                <>
                  <IconButton onClick={onClose} label="Zamknij">
                    <CloseIcon size={15} />
                  </IconButton>
                  <ThemeToggle />
                </>
              )}
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
                <div role="tablist" aria-label="Kierunek" className="inline-flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5">
                  <TabButton active={direction === 'departures'} onClick={() => switchDirection('departures')}>
                    Odjazdy
                  </TabButton>
                  <TabButton active={direction === 'arrivals'} onClick={() => switchDirection('arrivals')}>
                    Przyjazdy
                  </TabButton>
                </div>

                {destinationFilter !== null && (
                  <button
                    type="button"
                    onClick={() => setDestinationFilter(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-text-secondary transition hover:text-foreground"
                    style={{ borderColor: 'var(--surface-border)' }}
                  >
                    Kierunek: {destinationFilter}
                    <CloseIcon size={12} />
                  </button>
                )}
              </div>

              <BoardTable
                stationName={stationName}
                direction={direction}
                rows={rows}
                now={now}
                loading={snapshot === null && error === null}
              />
            </section>
          </>
        )}
      </div>

      {!configError && (
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh_-_3rem)] lg:overflow-y-auto">
          <StationAside
            insights={snapshot?.insights}
            disruptionMessages={snapshot?.disruptionMessages ?? []}
            destinationFilter={destinationFilter}
            onDestinationFilter={setDestinationFilter}
            loading={snapshot === null && error === null}
            currentHour={new Date(now).getHours()}
            weather={weather}
            stationName={stationName}
          />
        </aside>
      )}
    </div>
  )
}
