'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCities, type CityEntry } from '@/hooks/useCities'
import { useCityContext } from '@/hooks/useCityContext'
import { defaultCityId } from '@/lib/cityDefault'
import { encodeStopIdForPathSegment } from '@/lib/validation'
import { CloseIcon, ICON_SIZE } from './icons'
import { IconButton } from './IconButton'
import { RecentPlaces } from './RecentPlaces'
import { StationSearch, type StationOption } from './StationSearch'

const PATH_CITY = /^\/city\/([a-z]{2,24})(\/|$)/

/**
 * Miasto, w którym szukamy: to z adresu (`/city/[city]/…`), potem ostatnio wybrane,
 * na końcu domyślne (najwięcej stacji kolejowych). `null` = jeszcze nie wiadomo.
 */
export function resolveSearchCity(pathname: string, contextCity: string | null, cities: CityEntry[] | null): string | null {
  const fromPath = PATH_CITY.exec(pathname)
  if (fromPath !== null) return fromPath[1]
  if (contextCity !== null) return contextCity
  return cities === null ? null : defaultCityId(cities)
}

/**
 * Jedno globalne okno wyszukiwania (natywny `<dialog>`: focus trap, `inert` tła i Escape za darmo)
 * dla telefonu i desktopu. Zawartość montuje się tylko przy otwarciu — świeże pole, zero fetchy,
 * gdy zamknięte.
 */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  const lastPathname = useRef(pathname)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Pole, które zdążyło się zamontować razem z dialogiem, dostaje fokus dopiero teraz — `autoFocus`
      // Reacta zadziałał, gdy dialog był jeszcze ukryty. Pole montowane później (miasto z `/api/cities`)
      // ma już własny `autoFocus`.
      dialog.querySelector<HTMLElement>('[role="combobox"]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Wybór wyniku, tap w „Ostatnio oglądane" czy przycisk wstecz — każda zmiana adresu zamyka okno.
  useEffect(() => {
    if (lastPathname.current === pathname) return
    lastPathname.current = pathname
    onClose()
  }, [pathname, onClose])

  function handleClick(event: MouseEvent<HTMLDialogElement>): void {
    const target = event.target as Element
    // Tło (`::backdrop`) zgłasza klik na samym `<dialog>`; link do bieżącej strony nie zmienia adresu,
    // więc też zamykamy tutaj.
    if (target === event.currentTarget || target.closest('a') !== null) onClose()
  }

  return (
    // Klawiatura: Escape obsługuje natywny dialog (`close` → onClose); ten onClick to tylko klik myszą/palcem.
    <dialog
      ref={ref}
      aria-label="Szukaj stacji lub przystanku"
      onClose={onClose}
      onClick={handleClick}
      className="m-0 max-h-dvh w-full max-w-none overflow-y-auto rounded-b-2xl text-foreground shadow-2xl backdrop:bg-black/50 sm:mx-auto sm:mt-[12vh] sm:max-h-[76dvh] sm:max-w-xl sm:rounded-2xl"
      style={{ background: 'var(--bg-gradient)', backgroundColor: 'var(--bg-base)', overscrollBehavior: 'contain' }}
    >
      {open && <SearchDialogBody onClose={onClose} />}
    </dialog>
  )
}

function SearchDialogBody({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const { city: contextCity } = useCityContext()
  const { state, cities, retry } = useCities()
  const city = resolveSearchCity(pathname, contextCity, state === 'ready' ? cities : null)

  function select(option: StationOption): void {
    const name = encodeURIComponent(option.name)
    if (option.kind === 'transit' && city !== null) {
      router.push(`/city/${city}/stop/${encodeStopIdForPathSegment(option.id)}?name=${name}`)
    } else {
      router.push(`/station/${option.id}?name=${name}`)
    }
    onClose()
  }

  return (
    <div className="p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="flex items-start gap-2">
        {city !== null ? (
          <StationSearch
            variant="sheet"
            autoFocus
            placeholder="Szukaj stacji lub przystanku…"
            endpoint={`/api/search?city=${encodeURIComponent(city)}&rail=all`}
            idle={<RecentPlaces limit={8} headingLevel="h3" />}
            onSelect={select}
          />
        ) : (
          <CityUnknown state={state} retry={retry} />
        )}
        <IconButton label="Zamknij" onClick={onClose} size="lg">
          <CloseIcon size={ICON_SIZE.button} />
        </IconButton>
      </div>
    </div>
  )
}

/** Miasto nieznane: wczytywanie, porażka (z ponowieniem) albo pusty rejestr — trzy różne komunikaty (AGENTS.md #7). */
function CityUnknown({ state, retry }: { state: 'loading' | 'failed' | 'ready'; retry: () => void }) {
  if (state === 'failed') {
    return (
      <div className="flex w-full flex-col items-start gap-2 text-sm text-text-secondary">
        <p>Nie udało się wczytać listy miast</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-secondary"
        >
          Spróbuj ponownie
        </button>
      </div>
    )
  }
  return <p className="w-full py-2.5 text-sm text-text-secondary">{state === 'ready' ? 'Brak skonfigurowanych miast' : 'Wczytuję…'}</p>
}
