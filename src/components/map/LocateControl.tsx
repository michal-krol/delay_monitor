'use client'

import { LocateIcon, ICON_SIZE } from '../icons'
import { useUserLocation, type UserPoint } from '@/hooks/useUserLocation'

const MESSAGE = 'glass-chrome-strong border border-surface-border shadow-md pointer-events-auto absolute right-14 top-0 w-max max-w-[min(18rem,calc(100vw-5rem))] rounded-xl px-3 py-1.5 text-sm'

/**
 * „Moja lokalizacja" (adr/0012): pozycja tylko po kliknięciu, jednorazowo, w pamięci providera.
 * Strona dostaje punkt w `onLocated`; stan żądania i odmowy jest tutaj, bez przycisku ponowienia
 * po odmowie (przeglądarka i tak nie zapyta drugi raz).
 */
export function LocateControl({ onLocated, className = '' }: { onLocated: (point: UserPoint) => void; className?: string }) {
  const { status, request } = useUserLocation()

  async function locate(): Promise<void> {
    const point = await request()
    if (point !== null) onLocated(point)
  }

  return (
    <div className={`pointer-events-none ${className}`}>
      <button
        type="button"
        onClick={() => void locate()}
        aria-label="Moja lokalizacja"
        aria-busy={status === 'requesting'}
        title="Moja lokalizacja"
        className="glass-chrome border border-surface-border shadow-md pointer-events-auto grid h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <LocateIcon size={ICON_SIZE.tile} />
      </button>
      {status === 'requesting' && (
        <p role="status" className={MESSAGE}>
          Szukam lokalizacji…
        </p>
      )}
      {status === 'denied' && (
        <p role="status" className={MESSAGE}>
          Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie
        </p>
      )}
      {status === 'unavailable' && (
        <p role="status" className={MESSAGE}>
          Lokalizacja nie jest dostępna w tej przeglądarce
        </p>
      )}
      {status === 'error' && (
        <div role="status" className={MESSAGE}>
          <p>Nie udało się ustalić lokalizacji</p>
          <button type="button" onClick={() => void locate()} className="touch-44 relative mt-1 font-medium text-primary-text underline underline-offset-2">
            Spróbuj ponownie
          </button>
        </div>
      )}
    </div>
  )
}
