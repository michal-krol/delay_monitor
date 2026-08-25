'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardStatus } from './BoardStatus'
import { BoardTable } from './BoardTable'
import { patchUrlParams, readUrlParam } from '@/lib/urlState'
import { useSnapshotNow } from '@/hooks/useSnapshotNow'

type Props = {
  stationId: string
  stationName: string
  isFavourite: boolean
  onToggleFavourite: () => void
  onClose: () => void
}

export type Direction = 'departures' | 'arrivals'

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

export function FullBoard({ stationId, stationName, isFavourite, onToggleFavourite, onClose }: Props) {
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

            <BoardTable stationName={stationName} direction={direction} rows={rows} now={now} />
          </>
        )}
      </section>
    </>
  )
}
