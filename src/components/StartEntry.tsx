'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUserLocation, type UserLocationStatus } from '@/hooks/useUserLocation'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'
import { ActionGrid } from './ActionGrid'
import { ICON_SIZE, LocateIcon, MapIcon, SearchIcon } from './icons'
import { SEARCH_INPUT_BASE } from './StationSearch'

/** Pole szukania na Starcie to wejście, nie pole: telefon przechodzi na `/search`, desktop otwiera okno (decyduje strona). */
const SEARCH_ENTRY_CLASS = `glass flex min-h-11 w-full items-center gap-2.5 text-left text-text-secondary hover:text-foreground border border-surface-border ${SEARCH_INPUT_BASE}`

/** Opis stanu GPS pod przyciskiem „W pobliżu mnie”; `idle`/`requesting`/`ready` nie mają opisu (w pierwszym i ostatnim nic się nie stało, w drugim mówi sam przycisk). */
const LOCATION_MESSAGE: Partial<Record<UserLocationStatus, string>> = {
  denied: 'Brak dostępu do lokalizacji. Wyszukaj miejsce powyżej.',
  unavailable: 'Lokalizacja nie jest dostępna w tej przeglądarce',
  error: 'Nie udało się ustalić lokalizacji. Spróbuj ponownie lub wyszukaj miejsce.',
}

/**
 * Wejście na Start (adr/0012): wyszukiwanie, „W pobliżu mnie” i „Otwórz mapę”. GPS rusza wyłącznie po kliknięciu
 * „W pobliżu mnie” (`request()`); dopiero udana odpowiedź otwiera `/map?nearby=1`, gdzie są dane okolicy. Odmowa albo
 * brak GPS zostawia wyszukiwanie. Pozycja żyje tylko w providerze — tu nie ma jej w stanie, URL-u ani storage (#4).
 */
export function StartEntry({ onSearch }: { onSearch: () => void }) {
  const router = useRouter()
  const { status, request } = useUserLocation()
  const requesting = status === 'requesting'

  async function findNearby(): Promise<void> {
    if (requesting) return
    const point = await request()
    if (point !== null) router.push('/map?nearby=1', NAV_FORWARD_OPTIONS)
  }

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onSearch} className={SEARCH_ENTRY_CLASS}>
        <SearchIcon size={ICON_SIZE.button} className="shrink-0" />
        Stacja, przystanek lub linia
      </button>
      <ActionGrid cols={2}>
        <button
          type="button"
          onClick={() => void findNearby()}
          aria-busy={requesting}
          className="chip-filter gap-2 px-3 text-primary-text"
        >
          <LocateIcon size={ICON_SIZE.button} className="shrink-0" />
          {requesting ? 'Ustalanie lokalizacji…' : 'W pobliżu mnie'}
        </button>
        <Link href="/map" className="chip-filter gap-2 px-3 text-primary-text">
          <MapIcon size={ICON_SIZE.button} className="shrink-0" />
          Otwórz mapę
        </Link>
      </ActionGrid>
      {/* Zawsze w DOM: region ogłasza zmianę treści, nie swoje pojawienie się; pusty jest `sr-only` (nie zajmuje odstępu). */}
      <p aria-live="polite" className={LOCATION_MESSAGE[status] === undefined ? 'sr-only' : 'text-sm text-text-secondary'}>
        {LOCATION_MESSAGE[status]}
      </p>
    </div>
  )
}
