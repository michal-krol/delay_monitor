// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'
import type { UserLocationStatus } from '@/hooks/useUserLocation'
import { stubDialogMethods } from '@/test-utils/dialog'
import { NAV_FORWARD_OPTIONS, NAV_TAB_TYPES } from '@/lib/navTransition'

const push = vi.fn()
const replace = vi.fn()
// Mutable seed read once per `render(<Page />)` — set per-test before rendering.
let searchParamsSeed = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchParamsSeed),
}))

// Szerokość: SM_UP = „szeroko” (desktop, domyślnie jak w SSR); `false` = telefon.
let wide = true
vi.mock('@/hooks/useMediaQuery', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/useMediaQuery')>()
  return { ...original, useMediaQuery: (query: string, server: boolean) => (query === original.SM_UP ? wide : server) }
})

// GPS: provider ma własne testy; tu kontrakt strony — pytamy dopiero po kliknięciu.
let locationStatus: UserLocationStatus = 'idle'
const requestLocation = vi.fn()
vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ status: locationStatus, point: null, fixAt: null, request: requestLocation }),
}))

// Mutable seed read once per `render(<Page />)` (fresh component tree per
// test) — set it in `beforeEach`/per-test before rendering. The hook itself
// uses real `useState` so `removePinned` triggers a real re-render within
// a test, the same reactivity a stateful `usePinned()` gives the real page.
let initialPinned: PinnedItem[] = []
let pinnedLoaded = true

vi.mock('@/hooks/usePinned', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePinned')>()),
  usePinned: () => {
    const [pinnedItems, setPinnedItems] = useState(initialPinned)
    return {
      pinnedItems,
      loaded: pinnedLoaded,
      addPinned: (item: PinnedItem, index?: number) =>
        setPinnedItems((current) => {
          const next = [...current]
          next.splice(index ?? current.length, 0, item)
          return next
        }),
      removePinned: (key: string) =>
        setPinnedItems((current) => current.filter((item) => pinnedKey(item) !== key)),
      movePinned: (key: string, delta: -1 | 1) =>
        setPinnedItems((current) => {
          const from = current.findIndex((item) => pinnedKey(item) === key)
          const next = [...current]
          ;[next[from], next[from + delta]] = [next[from + delta], next[from]]
          return next
        }),
      replacePinned: vi.fn(),
      isPinned: (key: string) => pinnedItems.some((item) => pinnedKey(item) === key),
    }
  },
}))

// Okno wyszukiwania ma własne testy; tu tylko kontrakt trybu „Dodaj": `onPick(wynik, miasto)`.
let pickOption: { id: string; name: string; kind?: 'rail' | 'transit' } = { id: '5136', name: 'Kraków Główny', kind: 'rail' }
vi.mock('@/components/SearchDialog', () => ({
  SearchDialog: ({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick?: (option: typeof pickOption, city: string | null) => void }) =>
    open ? (
      <div role="dialog" aria-label={onPick ? 'Przypnij do Startu' : 'Szukaj stacji, przystanku, linii lub pociągu'}>
        <button
          type="button"
          onClick={() => {
            onPick?.(pickOption, 'warszawa')
            onClose()
          }}
        >
          wybierz wynik
        </button>
      </div>
    ) : null,
}))

vi.mock('@/hooks/useBoard', () => ({
  useBoard: () => ({ data: null, error: null }),
}))

describe('Page (Pulpit)', () => {
  // Restore even when an assertion fails, so fake timers and stubs never leak into the next test.
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    wide = true
    locationStatus = 'idle'
    requestLocation.mockReset()
    stubDialogMethods()
    push.mockClear()
    replace.mockClear()
    searchParamsSeed = ''
    initialPinned = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]
    pinnedLoaded = true
    pickOption = { id: '5136', name: 'Kraków Główny', kind: 'rail' }
    window.localStorage.clear()
  })

  it('nagłówek karty stacji to link do pełnego widoku stacji, z nazwą w adresie', () => {
    render(<Page />)
    const heading = screen.getByRole('heading', { name: 'Warszawa Centralna' })
    expect(within(heading).getByRole('link')).toHaveAttribute('href', '/station/33605?name=Warszawa%20Centralna')
  })

  it('przed odczytem przypiętych pokazuje szkielet Pulpitu, nie pusty ekran ani zachętę do przypinania', () => {
    pinnedLoaded = false
    render(<Page />)
    expect(screen.getByTestId('pulpit-skeleton')).toHaveAttribute('aria-busy', 'true')
    expect(within(screen.getByTestId('pulpit-skeleton')).getByText('Wczytywanie…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dodaj' })).toBeNull()
  })

  it('przekierowuje stary adres ?focus= na widok stacji, zachowując nazwę z przypiętych', () => {
    searchParamsSeed = 'focus=33605'
    render(<Page />)

    // `replace`, nie `push` -- przekierowanie nie ma zostawiać wpisu w
    // historii, bo „wstecz" wracałoby na adres, który znów przekierowuje.
    expect(replace).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Centralna')
    expect(push).not.toHaveBeenCalled()
  })

  it('przekierowuje ?focus= także dla stacji spoza przypiętych, bez nazwy', () => {
    searchParamsSeed = 'focus=999999999'
    render(<Page />)

    expect(replace).toHaveBeenCalledWith('/station/999999999')
  })

  it('ignoruje po cichu nieprawidłowe ?focus= i pokazuje zwykły pulpit', () => {
    searchParamsSeed = 'focus=abc'
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('pokazuje stan pusty z przyciskiem „Dodaj", bez „Edytuj ulubione", gdy nie ma przypiętych', () => {
    initialPinned = []
    render(<Page />)

    expect(screen.getByRole('button', { name: 'Dodaj' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edytuj ulubione' })).not.toBeInTheDocument()
    expect(screen.getByText(/przypnij je gwiazdką/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pokazuje dashboard zamiast stanu pustego, gdy przypięte są zapisane', () => {
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByText(/przypnij je gwiazdką/)).not.toBeInTheDocument()
  })

  it('„Dodaj" otwiera okno w trybie przypinania; wybór przypina stację i potwierdza, bez nawigacji', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Dodaj' }))
    const dialog = screen.getByRole('dialog', { name: 'Przypnij do Startu' })
    await user.click(within(dialog).getByRole('button', { name: 'wybierz wynik' }))

    expect(screen.getByRole('heading', { name: 'Kraków Główny' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Przypięto do Startu: Kraków Główny')
    expect(push).not.toHaveBeenCalled()
  })

  it('„Dodaj" przypina przystanek miejski z miastem wyszukiwania', async () => {
    pickOption = { id: '7014', name: 'Świętokrzyska', kind: 'transit' }
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Dodaj' }))
    await user.click(screen.getByRole('button', { name: 'wybierz wynik' }))

    expect(screen.getByRole('status')).toHaveTextContent('Przypięto do Startu: Świętokrzyska')
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('„Dodaj" już przypiętej stacji mówi, że jest na Starcie, i nie dubluje karty', async () => {
    pickOption = { id: '33605', name: 'Warszawa Centralna', kind: 'rail' }
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Dodaj' }))
    await user.click(screen.getByRole('button', { name: 'wybierz wynik' }))

    expect(screen.getByRole('status')).toHaveTextContent('Warszawa Centralna jest już na Starcie')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('wynik, którego nie da się zapisać (zły format id), nie przypina i mówi „Nie udało się przypiąć"', async () => {
    pickOption = { id: '5136&x=1', name: 'Kraków Główny', kind: 'rail' }
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Dodaj' }))
    await user.click(screen.getByRole('button', { name: 'wybierz wynik' }))

    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się przypiąć: Kraków Główny')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('„Edytuj ulubione": odpięcie pokazuje „Cofnij", które przywraca wpis na dawne miejsce', async () => {
    initialPinned = [
      { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
      { kind: 'pkp', id: '80416', name: 'Kraków Główny' },
      { kind: 'pkp', id: '7500', name: 'Gdańsk Główny' },
    ]
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Kraków Główny' }))
    expect(screen.getByRole('status')).toHaveTextContent('Odpięto ze Startu: Kraków Główny')

    await user.click(screen.getByRole('button', { name: 'Cofnij' }))
    const order = screen.getAllByRole('button', { name: /^W górę: / }).map((button) => button.getAttribute('aria-label'))
    expect(order).toEqual(['W górę: Warszawa Centralna', 'W górę: Kraków Główny', 'W górę: Gdańsk Główny'])
    expect(screen.queryByRole('button', { name: 'Cofnij' })).not.toBeInTheDocument()
  })

  it('„Cofnij" trwa do końca trybu edycji: „Gotowe" zamyka edycję i komunikat, karty wracają', async () => {
    initialPinned = [
      { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
      { kind: 'pkp', id: '80416', name: 'Kraków Główny' },
    ]
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Kraków Główny' }))
    await user.click(screen.getByRole('button', { name: 'Gotowe' }))

    expect(screen.queryByRole('button', { name: 'Cofnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('odpięcie ostatniego wpisu w edycji pokazuje stan pusty, ale „Cofnij" i „Gotowe" zostają', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Warszawa Centralna' }))

    expect(screen.getByText(/przypnij je gwiazdką/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gotowe' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cofnij' }))
    expect(screen.getByRole('list', { name: 'Kolejność przypiętych' })).toHaveTextContent('Warszawa Centralna')
  })

  it('„Cofnij" po odpięciu ostatniego wpisu oddaje fokus „Gotowe", nie <body> (przycisk montuje się na nowo)', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Warszawa Centralna' }))
    await user.click(screen.getByRole('button', { name: 'Cofnij' }))

    expect(screen.getByRole('button', { name: 'Gotowe' })).toHaveFocus()
  })

  it('pierwsze przypięcie z pustego Pulpitu zostawia fokus na „Dodaj", nie na <body>', async () => {
    initialPinned = []
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Dodaj' }))
    await user.click(screen.getByRole('button', { name: 'wybierz wynik' }))

    expect(screen.getByRole('heading', { name: 'Kraków Główny' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj' })).toHaveFocus()
  })

  it('otwarcie „Dodaj" w edycji nie kasuje „Cofnij"', async () => {
    const user = userEvent.setup()
    initialPinned = [
      { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
      { kind: 'pkp', id: '80416', name: 'Kraków Główny' },
    ]
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Kraków Główny' }))
    await user.click(screen.getByRole('button', { name: 'Dodaj' }))

    expect(screen.getByRole('button', { name: 'Cofnij' })).toBeInTheDocument()
  })

  it('„W górę" w edycji zmienia kolejność kart po wyjściu z edycji', async () => {
    initialPinned = [
      { kind: 'pkp', id: '33605', name: 'Warszawa Centralna' },
      { kind: 'gtfs', city: 'warszawa', id: '7014', name: 'Świętokrzyska' },
    ]
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Edytuj ulubione' }))
    await user.click(screen.getByRole('button', { name: 'W górę: Świętokrzyska' }))
    await user.click(screen.getByRole('button', { name: 'Gotowe' }))

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings.indexOf('Świętokrzyska')).toBeLessThan(headings.indexOf('Warszawa Centralna'))
  })

  it('exactly one h1 on the empty Pulpit and on the Pulpit with pinned cards', () => {
    initialPinned = []
    const { unmount } = render(<Page />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    unmount()

    initialPinned = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]
    render(<Page />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('pokazuje „Ostatnio oglądane” PO „Moje miejsca” i jej kartach, gdy są ostatnio oglądane', () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '100', name: 'Ostatnia stacja' }]))
    render(<Page />)

    const mine = screen.getByRole('heading', { name: 'Moje miejsca' })
    const pinnedHeading = screen.getByRole('heading', { name: 'Warszawa Centralna' })
    const recentHeading = screen.getByRole('heading', { name: 'Ostatnio oglądane' })
    expect(mine.compareDocumentPosition(pinnedHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pinnedHeading.compareDocumentPosition(recentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('pokazuje „Ostatnio oglądane” pod pustym stanem „Moje miejsca”, gdy brak przypiętych', () => {
    window.localStorage.setItem('monitor.recentPlaces.v1', JSON.stringify([{ kind: 'pkp', id: '100', name: 'Ostatnia stacja' }]))
    initialPinned = []
    render(<Page />)

    const emptyStateText = screen.getByText(/przypnij je gwiazdką/)
    const recentHeading = screen.getByRole('heading', { name: 'Ostatnio oglądane' })
    expect(emptyStateText.compareDocumentPosition(recentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ukrywa sekcję „Ostatnio oglądane", gdy jej brak', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: 'Ostatnio oglądane' })).not.toBeInTheDocument()
  })

  it('pokazuje co najwyżej 4 ostatnio oglądane', () => {
    window.localStorage.setItem(
      'monitor.recentPlaces.v1',
      JSON.stringify([
        { kind: 'pkp', id: '1', name: 'Stacja 1' },
        { kind: 'pkp', id: '2', name: 'Stacja 2' },
        { kind: 'pkp', id: '3', name: 'Stacja 3' },
        { kind: 'pkp', id: '4', name: 'Stacja 4' },
        { kind: 'pkp', id: '5', name: 'Stacja 5' },
      ])
    )
    render(<Page />)

    // Heading exists
    expect(screen.getByRole('heading', { name: 'Ostatnio oglądane' })).toBeInTheDocument()

    // Only 4 recent places shown despite 5 in storage (limit=4)
    expect(screen.getByRole('link', { name: 'Stacja 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 3' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stacja 4' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Stacja 5' })).not.toBeInTheDocument()
  })

  describe('Start (PR11)', () => {
    it('wejście do szukania: telefon prowadzi na /search (jak zakładka), bez otwierania okna', async () => {
      wide = false
      const user = userEvent.setup()
      render(<Page />)

      await user.click(screen.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' }))

      expect(push).toHaveBeenCalledWith('/search', { transitionTypes: NAV_TAB_TYPES })
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('wejście do szukania: desktop otwiera okno UnifiedSearch (bez trybu przypinania), bez nawigacji', async () => {
      const user = userEvent.setup()
      render(<Page />)

      await user.click(screen.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' }))

      expect(screen.getByRole('dialog', { name: 'Szukaj stacji, przystanku, linii lub pociągu' })).toBeInTheDocument()
      expect(push).not.toHaveBeenCalled()
    })

    it('GPS nie rusza przy renderze ani przy rerenderze — tylko po kliknięciu', () => {
      const { rerender } = render(<Page />)
      rerender(<Page />)
      expect(requestLocation).not.toHaveBeenCalled()
    })

    it('„W pobliżu mnie”: klik pyta o pozycję raz, a po sukcesie otwiera /map?nearby=1', async () => {
      requestLocation.mockResolvedValue({ lat: 52.2, lon: 21, accuracyM: 20 })
      const user = userEvent.setup()
      render(<Page />)

      await user.click(screen.getByRole('button', { name: 'W pobliżu mnie' }))

      expect(requestLocation).toHaveBeenCalledTimes(1)
      expect(push).toHaveBeenCalledWith('/map?nearby=1', NAV_FORWARD_OPTIONS)
    })

    it('spóźniona odpowiedź GPS po opuszczeniu Startu nie nawiguje na mapę', async () => {
      let resolve: (value: { lat: number; lon: number; accuracyM: number }) => void = () => {}
      requestLocation.mockReturnValue(new Promise((r) => (resolve = r)))
      const user = userEvent.setup()
      const { unmount } = render(<Page />)
      await user.click(screen.getByRole('button', { name: 'W pobliżu mnie' }))
      unmount()
      resolve({ lat: 52.2, lon: 21, accuracyM: 20 })
      await Promise.resolve()
      expect(push).not.toHaveBeenCalled()
    })

    it('odmowa albo brak pozycji: opis pod przyciskiem, bez nawigacji, wyszukiwanie zostaje', async () => {
      requestLocation.mockImplementation(async () => {
        locationStatus = 'denied'
        return null
      })
      const user = userEvent.setup()
      const { rerender } = render(<Page />)
      await user.click(screen.getByRole('button', { name: 'W pobliżu mnie' }))
      rerender(<Page />)

      expect(push).not.toHaveBeenCalled()
      expect(screen.getByText('Brak dostępu do lokalizacji. Wyszukaj miejsce powyżej.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' })).toBeEnabled()
    })

    it.each([
      ['unavailable', 'Lokalizacja nie jest dostępna w tej przeglądarce'],
      ['error', 'Nie udało się ustalić lokalizacji. Spróbuj ponownie lub wyszukaj miejsce.'],
    ] as const)('stan %s ma własny opis, a „W pobliżu mnie” zostaje aktywne (ponowna próba)', (status, text) => {
      locationStatus = status
      render(<Page />)
      expect(screen.getByText(text)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'W pobliżu mnie' })).toBeEnabled()
    })

    it('podczas pytania: „Ustalanie lokalizacji…”, aria-busy i kolejne kliknięcia nie wołają GPS', async () => {
      locationStatus = 'requesting'
      const user = userEvent.setup()
      render(<Page />)

      const button = screen.getByRole('button', { name: 'Ustalanie lokalizacji…' })
      expect(button).toHaveAttribute('aria-busy', 'true')
      await user.click(button)
      expect(requestLocation).not.toHaveBeenCalled()
      expect(screen.queryByText(/Brak dostępu|Nie udało się ustalić/)).toBeNull()
    })

    it('„Otwórz mapę” to zwykły link na /map (bez GPS)', () => {
      render(<Page />)
      expect(screen.getByRole('link', { name: 'Otwórz mapę' })).toHaveAttribute('href', '/map')
      expect(requestLocation).not.toHaveBeenCalled()
    })

    it('pusty storage: krótka instrukcja i „Znajdź miejsce” (otwiera szukanie), bez „Edytuj ulubione” i bez dużej karty', async () => {
      initialPinned = []
      wide = false
      const user = userEvent.setup()
      render(<Page />)

      expect(screen.getByRole('heading', { name: 'Moje miejsca' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edytuj ulubione' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Znajdź miejsce' }))
      expect(push).toHaveBeenCalledWith('/search', { transitionTypes: NAV_TAB_TYPES })
    })

    it('ładowanie pinów: szkielet bez „Znajdź miejsce” i bez fałszywego „Nie masz miejsc”, wejście do szukania już działa', () => {
      pinnedLoaded = false
      render(<Page />)
      expect(screen.getByTestId('pulpit-skeleton')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Znajdź miejsce' })).toBeNull()
      expect(screen.queryByText(/przypnij je gwiazdką/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' })).toBeInTheDocument()
    })

    it('desktop: statystyki sieci stoją w kolumnie bocznej, bez przycisku „Info”', () => {
      render(<Page />)
      expect(screen.getByRole('button', { name: /Dziś w Polsce/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Info' })).toBeNull()
    })

    it('telefon: statystyk nie ma pod kartami; „Info” na końcu otwiera arkusz „Informacje o sieci” i zamyka się', async () => {
      wide = false
      const user = userEvent.setup()
      render(<Page />)
      expect(screen.queryByRole('button', { name: /Dziś w Polsce/ })).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Info' }))
      const sheet = screen.getByRole('dialog', { name: 'Informacje o sieci' })
      expect(within(sheet).getByRole('button', { name: /Dziś w Polsce/ })).toHaveAttribute('aria-expanded', 'true')

      await user.click(within(sheet).getByRole('button', { name: 'Zamknij informacje' }))
      expect(screen.queryByRole('dialog', { name: 'Informacje o sieci' })).toBeNull()
    })

    it('telefon: „Info” jest po „Moje miejsca” (główne zadania wyżej)', () => {
      wide = false
      render(<Page />)
      const mine = screen.getByRole('heading', { name: 'Moje miejsca' })
      const info = screen.getByRole('button', { name: 'Info' })
      expect(mine.compareDocumentPosition(info) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('kolejność: H1 → wejście do szukania → okolica → „Moje miejsca”', () => {
      render(<Page />)
      const order = [
        screen.getByRole('heading', { level: 1, name: 'Start' }),
        screen.getByRole('button', { name: 'Stacja, przystanek, linia lub pociąg' }),
        screen.getByRole('button', { name: 'W pobliżu mnie' }),
        screen.getByRole('heading', { name: 'Moje miejsca' }),
      ]
      for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })
})
