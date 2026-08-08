'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'
import { BoardStatus } from './BoardStatus'
import { ConnectionDetails } from './ConnectionDetails'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { OPERATING_DATE_PATTERN, STATION_ID_PATTERN } from '@/lib/validation'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

type Direction = 'departures' | 'arrivals'

/**
 * Klucz otwartego panelu szczegółów. Nie `BoardApiRow` wprost — przy
 * odtwarzaniu z linku (bez klikniętego wiersza) nie ma pełnego wiersza
 * tabeli, tylko te trzy pola z URL-a. `trainLabel` może być puste: to
 * tylko tymczasowy tytuł, zanim `/api/train` odpowie własną nazwą trasy.
 */
type OpenConnection = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainLabel: string
}

/** "Dodaj/Usuń z ulubionych" i "Zamknij" mają identyczny wygląd — jedyna różnica to treść i akcja. */
function PillButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-black/10 transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/15"
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
        active
          ? 'bg-indigo-500 text-white shadow-sm'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>('departures')
  const [openConnection, setOpenConnection] = useState<OpenConnection | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const { data, error } = useBoard([stationId])
  const snapshot = data?.snapshots[0] ?? null
  const rows = snapshot ? snapshot[direction] : []
  const configError = data?.status === 'configError'

  // `Date.now()` nie może być wywołane bezpośrednio w renderze (impure). Zamiast
  // tykającego zegara — świadomie, appka już nie pokazuje relatywnego wieku —
  // odświeżamy „teraz" przy każdej nowej porcji danych, czyli tak samo często
  // jak i tak odświeża się lista (`useBoard`, co 30 s).
  const [now, setNow] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Date.now() jest impure i nie może być wołane w renderze; efekt odświeża "teraz" tylko gdy przyjdą nowe dane, nie w pętli
    setNow(Date.now())
  }, [data])

  // Odtworzenie zakładki i otwartego panelu z linku — raz, po zamontowaniu
  // (patrz identyczny wzorzec i uzasadnienie w page.tsx). Nieprawidłowy/
  // uszkodzony parametr jest po prostu ignorowany, `/api/train` i tak
  // waliduje niezależnie.
  useEffect(() => {
    const tab = readUrlParam('tab')
    if (tab === 'departures' || tab === 'arrivals') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odtworzenie stanu z URL-a, dostępnego tylko po zamontowaniu
      setDirection(tab)
    }

    const scheduleId = readUrlParam('scheduleId')
    const orderId = readUrlParam('orderId')
    const operatingDate = readUrlParam('operatingDate')
    if (
      scheduleId !== null &&
      orderId !== null &&
      operatingDate !== null &&
      STATION_ID_PATTERN.test(scheduleId) &&
      STATION_ID_PATTERN.test(orderId) &&
      OPERATING_DATE_PATTERN.test(operatingDate)
    ) {
      setOpenConnection({ scheduleId, orderId, operatingDate, trainLabel: '' })
    }
  }, [])

  // Zapis do URL-a przy każdej zmianie — `replaceState`, nie `pushState`
  // (patrz urlState.ts): zwykłe przełączanie zakładki czy klikanie połączeń
  // nie ma zaśmiecać historii cofania przeglądarki.
  useEffect(() => {
    patchUrlParams({
      tab: direction,
      scheduleId: openConnection?.scheduleId ?? null,
      orderId: openConnection?.orderId ?? null,
      operatingDate: openConnection?.operatingDate ?? null,
    })
  }, [direction, openConnection])

  // Zamknięcie całej tablicy (powrót do dashboardu) musi wyczyścić te
  // parametry — inaczej otwarcie kolejnej, innej stacji odziedziczyłoby
  // zakładkę/połączenie sprzed zamknięcia, przez wciąż obecne w URL-u wpisy.
  useEffect(() => {
    return () => {
      patchUrlParams({ tab: null, scheduleId: null, orderId: null, operatingDate: null })
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
          <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{stationName}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {copyStatus !== 'idle' && (
              <span role="status" className="text-sm text-gray-500 dark:text-gray-400">
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
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Pociąg</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Przewoźnik</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Kierunek</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Planowo</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Peron/Tor</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
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
                        setOpenConnection({
                          scheduleId: row.scheduleId,
                          orderId: row.orderId,
                          operatingDate: row.operatingDate,
                          trainLabel: row.trainLabel,
                        })
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
                        className={`border-b border-black/5 transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5 ${isPast ? 'opacity-50' : ''} ${canOpenDetails ? 'cursor-pointer' : ''}`}
                        onClick={canOpenDetails ? openDetails : undefined}
                      >
                        <td className="py-2.5 pr-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {canOpenDetails ? (
                            <button
                              type="button"
                              aria-haspopup="dialog"
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
                          <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                            <CarrierLogo carrierCode={row.carrier} size={16} />
                            <span className="sm:hidden">{row.carrier || '—'}</span>
                            <span className="hidden sm:inline">{row.carrierName ?? (row.carrier || '—')}</span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{row.headsign ?? '—'}</td>
                        {/* tabular-nums: godziny stoją jedna pod drugą, więc cyfry muszą mieć
                            równą szerokość — inaczej kolumna „faluje" i traci się sens tablicy. */}
                        <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
                          {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{row.platform ?? '—'}</td>
                        <td className="py-2.5 pr-3">
                          <DelayBadge
                            status={row.status}
                            delayMinutes={row.delayMinutes}
                            direction={direction === 'arrivals' ? 'arrival' : 'departure'}
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
      {openConnection && (
        <ConnectionDetails
          scheduleId={openConnection.scheduleId}
          orderId={openConnection.orderId}
          operatingDate={openConnection.operatingDate}
          trainLabel={openConnection.trainLabel}
          onClose={() => setOpenConnection(null)}
        />
      )}
    </>
  )
}
