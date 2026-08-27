'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from '@/hooks/useBoard'
import { ConfigErrorBanner } from './ConfigErrorBanner'
import { BoardStatus } from './BoardStatus'
import { BoardTable } from './BoardTable'
import { ThemeToggle } from './ThemeToggle'
import { CloseIcon, LinkIcon, StarIcon } from './icons'
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
            <IconButton onClick={onToggleFavourite} label={isFavourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
              <StarIcon size={15} className={isFavourite ? 'fill-current text-amber-400' : ''} />
            </IconButton>
            <IconButton onClick={() => void copyLink()} label="Kopiuj link">
              <LinkIcon size={15} />
            </IconButton>
            <IconButton onClick={onClose} label="Zamknij">
              <CloseIcon size={15} />
            </IconButton>
            <ThemeToggle />
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

            <BoardTable stationName={stationName} direction={direction} rows={rows} now={now} loading={snapshot === null && error === null} />
          </>
        )}
      </section>
    </>
  )
}
