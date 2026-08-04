'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { DelayBadge } from './DelayBadge'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { CarrierLogo } from './CarrierLogo'
import { BoardStatus } from './BoardStatus'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

type Direction = 'departures' | 'arrivals'

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

  return (
    <section className="glass rounded-2xl p-5">
      {configError && <ConfigErrorBanner />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{stationName}</h2>
        <div className="flex gap-2">
          <PillButton onClick={onToggleFavourite}>
            {isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          </PillButton>
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
                  <th scope="col" className="hidden py-2 pr-3 font-medium text-gray-500 dark:text-gray-400 sm:table-cell">Peron/Tor</th>
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
                  // 5 minut wstecz z transform.ts) — wizualnie przygaszony, żeby
                  // odróżnić go od nadchodzących, bez zmiany danych/statusu.
                  const isPast = new Date(row.plannedAt).getTime() < now
                  const primaryTextClass = isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'
                  const secondaryTextClass = isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
                  return (
                    <tr
                      key={`${row.trainNumber}-${row.plannedAt}`}
                      className="border-b border-black/5 transition hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <td className={`py-2.5 pr-3 whitespace-nowrap ${primaryTextClass}`}>
                        {row.trainLabel}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                          <CarrierLogo carrierCode={row.carrier} size={16} />
                          <span className="sm:hidden">{row.carrier || '—'}</span>
                          <span className="hidden sm:inline">{row.carrierName ?? (row.carrier || '—')}</span>
                        </span>
                      </td>
                      <td className={`py-2.5 pr-3 ${secondaryTextClass}`}>{row.headsign}</td>
                      {/* tabular-nums: godziny stoją jedna pod drugą, więc cyfry muszą mieć
                          równą szerokość — inaczej kolumna „faluje" i traci się sens tablicy. */}
                      <td className={`py-2.5 pr-3 whitespace-nowrap tabular-nums ${secondaryTextClass}`}>
                        {new Date(row.plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="hidden py-2.5 pr-3 text-gray-700 dark:text-gray-300 sm:table-cell">{row.platform ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <DelayBadge status={row.status} delayMinutes={row.delayMinutes} />
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
  )
}
