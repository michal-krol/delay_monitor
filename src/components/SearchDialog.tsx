'use client'

import { useEffect, useRef, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useCities, type CityEntry } from '@/hooks/useCities'
import { useCityContext } from '@/hooks/useCityContext'
import { defaultCityId } from '@/lib/cityDefault'
import { discoveryHref, type DiscoveryResult } from '@/lib/discovery'
import { CITY_ID_PATTERN } from '@/lib/validation'
import { CloseIcon, ICON_SIZE } from './icons'
import { IconButton } from './IconButton'
import type { StationOption } from './StationSearch'
import { UnifiedSearch } from './UnifiedSearch'
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
      // Pole montuje się razem z dialogiem, więc `autoFocus` Reacta zadziałał, gdy dialog był jeszcze
      // ukryty — fokus dostaje dopiero teraz.
      dialog.querySelector<HTMLElement>('input[type="search"]')?.focus()
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
      aria-label={onPick === undefined ? 'Szukaj stacji, przystanku, linii lub pociągu' : 'Przypnij do Startu'}
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

/** Dialog „Dodaj" przypina miejsca (stacje i przystanki) — linie i „Ostatnio oglądane" nie mają tu sensu. */
const PICK_KINDS: ReadonlyArray<DiscoveryResult['kind']> = ['rail', 'stop']

function SearchDialogBody({ onClose, onPick }: Pick<Props, 'onClose' | 'onPick'>) {
  const router = useRouter()
  const pathname = usePathname()
  const { city: contextCity } = useCityContext()
  const { state, cities } = useCities()
  // Miasto może być jeszcze nieznane: stacje PKP wyszukują się bez niego (przystanki i linie czekają na miasto).
  const city = resolveSearchCity(pathname, contextCity, state === 'ready' ? cities : null)

  function select(result: DiscoveryResult): void {
    if (onPick !== undefined) {
      if (result.kind === 'rail') onPick(result.station, city)
      else if (result.kind === 'stop') onPick(result.stop, result.city)
      else return
      onClose()
      return
    }
    const href = discoveryHref(result)
    if (href === null) return
    router.push(href, NAV_FORWARD_OPTIONS)
    onClose()
  }

  return (
    <div className="p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <UnifiedSearch
            autoFocus
            city={city}
            onSelect={select}
            kinds={onPick === undefined ? undefined : PICK_KINDS}
            recents={onPick === undefined}
          />
        </div>
        <IconButton label="Zamknij" onClick={onClose} size="lg">
          <CloseIcon size={ICON_SIZE.button} />
        </IconButton>
      </div>
    </div>
  )
}
