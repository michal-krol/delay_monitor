'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'
import { BoardStatus } from './BoardStatus'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

type Direction = 'departures' | 'arrivals'

/** "Dodaj/Usuń z ulubionych" i "Zamknij" mają identyczny wygląd — jedyna różnica to treść i akcja. Eksportowany do reużycia w `FocusedStation`. */
export function PillButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-medium text-text-secondary ring-1 ring-black/10 transition hover:bg-white/90 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15"
    >
      {children}
    </button>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose }: Props) {
  const router = useRouter()
  const [direction, setDirection] = useState<Direction>('departures')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const { data, error } = useBoard([stationId])
  const snapshot = data?.snapshots[0] ?? null
  const rows = snapshot ? snapshot[direction] : []
  const configError = data?.status === 'configError'

  const now = useSnapshotNow(data)

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
  }, [])

  // Zapis do URL-a przy każdej zmianie — `replaceState`, nie `pushState`
  // (patrz urlState.ts): zwykłe przełączanie zakładki nie ma zaśmiecać
  // historii cofania przeglądarki.
  useEffect(() => {
    patchUrlParams({ tab: direction })
  }, [direction])

  // Zamknięcie całej tablicy (powrót do dashboardu) musi wyczyścić `tab` —
  // inaczej otwarcie kolejnej, innej stacji odziedziczyłoby zakładkę sprzed
  // zamknięcia, przez wciąż obecny w URL-u wpis.
  useEffect(() => {
    return () => {
      patchUrlParams({ tab: null })
    }
  }, [])

  async function copyLink(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API niedostępne')
      await navigator.clipboard.writeText(window.location.href)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = setTimeout(() => setCopyStatus('idle'), 3000)
    return () => clearTimeout(timer)
  }, [copyStatus])

  return (
    <>
      <section className="glass rounded-2xl p-5">
        {configError && <ConfigErrorBanner />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{stationName}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {copyStatus !== 'idle' && (
              <span role="status" className="text-sm text-text-secondary">
                {copyStatus === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
              </span>
            )}
            <PillButton onClick={onToggleFavourite}>
              {isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            </PillButton>
            <PillButton onClick={() => void copyLink()}>Kopiuj link</PillButton>
            <PillButton onClick={onClose}>Zamknij</PillButton>
          </div>
        </div>

        {/* Baner z błędem konfiguracji nie ma slotu na przycisk, więc nie może
            całkowicie zastąpić widoku (jak robi StationCard) — FullBoard jest
            jedynym widokiem na ekranie i użytkownik musiałby stąd wyjść. Ukrywamy
            więc tylko zależne od danych zakładki/status/tabelę, żeby baner
            "sprawdź klucz API" nie sąsiadował z wyglądającą na działającą tabelą. */}
        {!configError && (
          <>
            <div
              role="tablist"
              aria-label="Kierunek"
              className="mt-4 inline-flex gap-1 rounded-full bg-black/5 p-1 dark:bg-white/5"
            >
              <TabButton active={direction === 'departures'} onClick={() => setDirection('departures')}>
                Odjazdy
              </TabButton>
              <TabButton active={direction === 'arrivals'} onClick={() => setDirection('arrivals')}>
                Przyjazdy
              </TabButton>
            </div>

            <div className="mt-3">
              <BoardStatus fetchedAt={snapshot?.fetchedAt} ageMs={snapshot?.ageMs} data={data} error={error !== null} />
            </div>

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
                    <th scope="col" className="py-2 pr-3 font-medium text-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-text-muted">
                        {direction === 'departures'
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}
