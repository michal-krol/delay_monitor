'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCities, type CityEntry } from '@/hooks/useCities'
import { useCityContext } from '@/hooks/useCityContext'
import { defaultCityId } from '@/lib/cityDefault'
import { CITY_ID_PATTERN, encodeStopIdForPathSegment } from '@/lib/validation'
import { CloseIcon, ICON_SIZE } from './icons'
import { IconButton } from './IconButton'
import { RecentPlaces } from './RecentPlaces'
import { StationSearch, type StationOption } from './StationSearch'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'

/** Segment po `/city/` — format sprawdza `CITY_ID_PATTERN` (AGENTS.md #4), nie ten regex. */
const PATH_CITY_SEGMENT = /^\/city\/([^/]+)/

/**
 * Miasto, w którym szukamy: to z adresu (`/city/[city]/…`), potem ostatnio wybrane,
 * na końcu domyślne (najwięcej stacji kolejowych). `null` = jeszcze nie wiadomo.
 */
export function resolveSearchCity(pathname: string, contextCity: string | null, cities: CityEntry[] | null): string | null {
  const segment = PATH_CITY_SEGMENT.exec(pathname)?.[1]
  if (segment !== undefined && CITY_ID_PATTERN.test(segment)) return segment
  if (contextCity !== null) return contextCity
  return cities === null ? null : defaultCityId(cities)
}

/**
 * Jedno globalne okno wyszukiwania (natywny `<dialog>`: focus trap, `inert` tła i Escape za darmo)
 * dla telefonu i desktopu. Zawartość montuje się tylko przy otwarciu — świeże pole, zero fetchy,
 * gdy zamknięte.
 */
type Props = {
  open: boolean
  onClose: () => void
  /**
   * Tryb „Dodaj" (Pulpit): wybór oddaje wynik i miasto wyszukiwania zamiast otwierać tablicę. Bez
   * „Ostatnio oglądanych" — to linki, które by nawigowały zamiast przypinać.
   */
  onPick?: (option: StationOption, city: string | null) => void
}

export function SearchDialog({ open, onClose, onPick }: Props) {
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
    // Klawiatura: Escape = `cancel` → onClose wprost (jak `InfoSheet`; `close` bywa niewysyłane), `close` zostaje
    // zapasem dla zamknięcia bez `cancel`. Ten onClick to tylko klik myszą/palcem.
    <dialog
      ref={ref}
      aria-label={onPick === undefined ? 'Szukaj stacji lub przystanku' : 'Przypnij do Pulpitu'}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
      onClick={handleClick}
      className="m-0 max-h-dvh w-full max-w-none overflow-y-auto rounded-b-2xl text-foreground shadow-2xl backdrop:bg-black/50 sm:mx-auto sm:mt-[12vh] sm:max-h-[76dvh] sm:max-w-xl sm:rounded-2xl"
      style={{ background: 'var(--bg-gradient)', backgroundColor: 'var(--bg-base)', overscrollBehavior: 'contain' }}
    >
      {open && <SearchDialogBody onClose={onClose} onPick={onPick} />}
    </dialog>
  )
}

function SearchDialogBody({ onClose, onPick }: Pick<Props, 'onClose' | 'onPick'>) {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { city: contextCity } = useCityContext()
  const { state, cities, retry } = useCities()
  const city = resolveSearchCity(pathname, contextCity, state === 'ready' ? cities : null)

  function select(option: StationOption): void {
    if (onPick !== undefined) {
      onPick(option, city)
      onClose()
      return
    }
    const name = encodeURIComponent(option.name)
    if (option.kind === 'transit' && city !== null) {
      router.push(`/city/${city}/stop/${encodeStopIdForPathSegment(option.id)}?name=${name}`, NAV_FORWARD_OPTIONS)
    } else {
      router.push(`/station/${option.id}?name=${name}`, NAV_FORWARD_OPTIONS)
    }
    onClose()
  }

  // „Wyczyść" usuwa zogniskowany przycisk — fokus wraca do pola, zamiast wypaść na `<body>` poza modal.
  function focusInput(): void {
    root.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus()
  }

  return (
    <div ref={root} className="p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="flex items-start gap-2">
        {city !== null ? (
          <StationSearch
            variant="sheet"
            autoFocus
            placeholder="Szukaj stacji lub przystanku…"
            endpoint={`/api/search?city=${encodeURIComponent(city)}&rail=all`}
            idle={onPick === undefined ? <RecentPlaces limit={8} headingLevel="h3" onCleared={focusInput} /> : undefined}
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
