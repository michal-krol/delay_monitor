// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullBoard } from './FullBoard'
import { jsonResponse } from '@/test-utils/http'
import { stubMatchMedia } from '@/test-utils/media'
import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'

// Szczegóły połączenia mają teraz własną trasę (`/connection/...`) — klik w
// wiersz nawiguje przez `router.push`, zamiast otwierać panel w miejscu.
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  push.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const SNAPSHOT = {
  stationId: '5100',
  stationName: 'Warszawa Centralna',
  departures: [
    {
      scheduleId: '2026',
      orderId: '12345',
      operatingDate: '2026-08-01',
      trainNumber: '1',
      trainLabel: 'EIC 1',
      carrier: 'IC',
      category: 'EIC',
      headsign: 'Kraków',
      plannedAt: new Date().toISOString(),
      actualAt: null,
      delayMinutes: 0,
      status: 'onTime',
      platform: '1',
    },
  ],
  arrivals: [
    {
      scheduleId: '2026',
      orderId: '67890',
      operatingDate: '2026-08-01',
      trainNumber: '2',
      trainLabel: 'TLK 2',
      carrier: 'IC',
      category: 'TLK',
      headsign: 'Gdynia',
      plannedAt: new Date().toISOString(),
      actualAt: null,
      delayMinutes: 0,
      status: 'unknown',
      platform: null,
    },
  ],
  fetchedAt: new Date().toISOString(),
  ageMs: 1000,
}

describe('FullBoard', () => {
  it('records the station in recent places once the snapshot loads', async () => {
    window.localStorage.removeItem('monitor.recentPlaces.v1')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    // Przed snapshotem nic nie zapisujemy — tablica mogła się nie wczytać (zła/nieistniejąca stacja).
    expect(window.localStorage.getItem('monitor.recentPlaces.v1')).toBeNull()
    await screen.findByText('EIC 1')
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('monitor.recentPlaces.v1') ?? '[]')).toEqual([
        { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' },
      ])
    )
    window.localStorage.removeItem('monitor.recentPlaces.v1')
  })

  it('records the server-resolved snapshot name, never the ?name= prop text', async () => {
    window.localStorage.removeItem('monitor.recentPlaces.v1')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Kliknij tutaj: przykładowy-link.example" isPinned={false} onTogglePin={vi.fn()} />)

    await screen.findByText('EIC 1')
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('monitor.recentPlaces.v1') ?? '[]')).toEqual([
        { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' },
      ])
    )
    window.localStorage.removeItem('monitor.recentPlaces.v1')
  })

  it('does not record when the snapshot name is just the id', async () => {
    window.localStorage.removeItem('monitor.recentPlaces.v1')
    const unnamed = { ...SNAPSHOT, stationName: '5100' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [unnamed], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    await screen.findByText('EIC 1')
    expect(window.localStorage.getItem('monitor.recentPlaces.v1')).toBeNull()
  })

  it('renders a table with caption and scoped headers, defaulting to departures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    expect(await screen.findByText('EIC 1')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('scope', 'col')
    // Przewoźnik nie ma już własnej kolumny -- wg makiety siedzi razem z
    // numerem pociągu i kategorią w kolumnie „Pociąg".
    expect(screen.getByRole('columnheader', { name: 'Pociąg' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Kierunek i przystanki pośrednie' })).toBeInTheDocument()
    expect(screen.queryByText('TLK 2')).not.toBeInTheDocument()
  })

  it('shows the carrier logo next to the code for a known carrier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    expect(await screen.findByText('EIC 1')).toBeInTheDocument()

    // Logo jest dekoracyjne (alt=""), bo kod przewoźnika stoi obok jako tekst.
    // Pusty alt wyklucza obraz z drzewa dostępności, więc getByRole('img', ...)
    // fizycznie go nie znajdzie — document.querySelector jest tu jedyną opcją.
    // eslint-disable-next-line testing-library/no-node-access
    const logo = document.querySelector('img[src="/carriers/pkp-ic.svg"]')
    expect(logo).not.toBeNull()
    expect(logo).toHaveAttribute('alt', '')
  })

  it('shows the carrier code, falling back to a dash when empty', async () => {
    const snapshotWithoutCarrier = {
      ...SNAPSHOT,
      departures: [{ ...SNAPSHOT.departures[0], carrier: '' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshotWithoutCarrier], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    await screen.findByText('EIC 1')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('EIC 1'))
    expect(row).toHaveTextContent('—')
  })

  it('shows the carrier name once, not duplicated into breakpoint variants', async () => {
    const snapshotWithName = { ...SNAPSHOT, departures: [{ ...SNAPSHOT.departures[0], carrierName: 'PKP Intercity' }] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshotWithName], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    // Wcześniej kod i pełna nazwa renderowały się OBA, przełączane klasami
    // `sm:hidden`/`hidden sm:inline` -- czytnik ekranu czytał przewoźnika
    // dwa razy. Teraz jest jeden element: pełna nazwa, z kodem jako rezerwą.
    expect(screen.getByText('PKP Intercity')).toBeInTheDocument()
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })

  it('shows the platform and track column on narrow screens too, no longer hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    // Peron i tor to teraz dwie osobne wartości pod sobą (makieta §10),
    // stąd nagłówek „Peron" z podpisem „tor", a nie jedno „Peron/Tor".
    expect(screen.getByRole('columnheader', { name: 'Peron i tor' })).not.toHaveClass('hidden')
  })

  it('dims the whole row -- train name, carrier, direction, time and status badge -- for a departure that already passed', async () => {
    const past = { ...SNAPSHOT.departures[0], trainLabel: 'PAST1', plannedAt: new Date(Date.now() - 2 * 60000).toISOString() }
    const future = { ...SNAPSHOT.departures[0], trainNumber: '2', trainLabel: 'FUTURE2', plannedAt: new Date(Date.now() + 10 * 60000).toISOString() }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [past, future] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('PAST1')

    const pastRow = screen.getAllByRole('row').find((r) => within(r).queryByText('PAST1'))
    const futureRow = screen.getAllByRole('row').find((r) => within(r).queryByText('FUTURE2'))
    expect(pastRow).toHaveClass('opacity-50')
    expect(futureRow).not.toHaveClass('opacity-50')
  })

  it('switches to arrivals when the arrivals tab is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    expect(await screen.findByText('EIC 1')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('TLK 2')).toBeInTheDocument()
    expect(screen.queryByText('EIC 1')).not.toBeInTheDocument()
  })

  describe('direction tabs (WAI-ARIA tabs pattern)', () => {
    async function setupBoard() {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      expect(await screen.findByText('EIC 1')).toBeInTheDocument()
      return user
    }

    it('links each tab to the labelled tabpanel around the board, with a roving tabindex', async () => {
      const user = await setupBoard()
      const departures = screen.getByRole('tab', { name: 'Odjazdy' })
      const arrivals = screen.getByRole('tab', { name: 'Przyjazdy' })
      const panel = screen.getByRole('tabpanel')
      expect(departures).toHaveAttribute('aria-controls', panel.id)
      expect(arrivals).toHaveAttribute('aria-controls', panel.id)
      expect(panel).toHaveAttribute('aria-labelledby', departures.id)
      expect(departures).toHaveAttribute('tabindex', '0')
      expect(arrivals).toHaveAttribute('tabindex', '-1')
      await user.click(arrivals)
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', arrivals.id)
      expect(arrivals).toHaveAttribute('tabindex', '0')
      expect(departures).toHaveAttribute('tabindex', '-1')
      expect(within(screen.getByRole('tabpanel')).getByRole('table')).toBeInTheDocument()
    })

    it('ArrowRight/ArrowLeft move selection and focus, wrapping around', async () => {
      const user = await setupBoard()
      const departures = screen.getByRole('tab', { name: 'Odjazdy' })
      const arrivals = screen.getByRole('tab', { name: 'Przyjazdy' })
      departures.focus()
      await user.keyboard('{ArrowRight}')
      expect(arrivals).toHaveAttribute('aria-selected', 'true')
      expect(arrivals).toHaveFocus()
      await user.keyboard('{ArrowRight}')
      expect(departures).toHaveAttribute('aria-selected', 'true')
      expect(departures).toHaveFocus()
      await user.keyboard('{ArrowLeft}')
      expect(arrivals).toHaveAttribute('aria-selected', 'true')
      expect(arrivals).toHaveFocus()
    })

    it('leaves modified arrows alone (Alt+ArrowRight is a browser shortcut)', async () => {
      const user = await setupBoard()
      const departures = screen.getByRole('tab', { name: 'Odjazdy' })
      departures.focus()
      await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
      expect(departures).toHaveAttribute('aria-selected', 'true')
      expect(departures).toHaveFocus()
    })

    it('End and Home jump to the last and first tab', async () => {
      const user = await setupBoard()
      const departures = screen.getByRole('tab', { name: 'Odjazdy' })
      const arrivals = screen.getByRole('tab', { name: 'Przyjazdy' })
      departures.focus()
      await user.keyboard('{End}')
      expect(arrivals).toHaveAttribute('aria-selected', 'true')
      expect(arrivals).toHaveFocus()
      await user.keyboard('{Home}')
      expect(departures).toHaveAttribute('aria-selected', 'true')
      expect(departures).toHaveFocus()
    })
  })

  it('uses direction-aware wording for a not-yet-happened connection: "jeszcze nie wyjechał" for departures, "jeszcze nie przyjechał" for arrivals', async () => {
    const notStartedSnapshot = {
      ...SNAPSHOT,
      departures: [{ ...SNAPSHOT.departures[0], status: 'notStarted', delayMinutes: null }],
      arrivals: [{ ...SNAPSHOT.arrivals[0], status: 'notStarted', delayMinutes: null }],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [notStartedSnapshot], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    expect(await screen.findByText('jeszcze nie wyjechał')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(await screen.findByText('jeszcze nie przyjechał')).toBeInTheDocument()
    expect(screen.queryByText('jeszcze nie wyjechał')).not.toBeInTheDocument()
  })

  it('shows the estimated delay for an enRoute connection, and plain "w trasie" when there is no estimate yet', async () => {
    const enRouteSnapshot = {
      ...SNAPSHOT,
      departures: [
        { ...SNAPSHOT.departures[0], trainLabel: 'WITH_ESTIMATE', status: 'enRoute', delayMinutes: null, estimatedDelayMinutes: 30 },
        { ...SNAPSHOT.departures[0], trainNumber: '99', trainLabel: 'NO_ESTIMATE', status: 'enRoute', delayMinutes: null, estimatedDelayMinutes: null },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [enRouteSnapshot], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    expect(await screen.findByText('w trasie, ~+30 min')).toBeInTheDocument()
    expect(screen.getByText('w trasie')).toBeInTheDocument()
  })

  it('names the right direction in the empty-board message', async () => {
    const empty = { ...SNAPSHOT, departures: [], arrivals: [] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [empty], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    expect(await screen.findByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('Brak przyjazdów w najbliższych godzinach')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w najbliższych godzinach')).not.toBeInTheDocument()
  })

  it('shows the correct pin toggle label and calls the handler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const onTogglePin = vi.fn()
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={onTogglePin} />)
    await user.click(screen.getByRole('button', { name: 'Przypnij do Pulpitu' }))

    expect(onTogglePin).toHaveBeenCalled()
  })

  it('hides the tabs and table behind the config-error banner', async () => {
    // Bez tego użytkownik widziałby baner "sprawdź klucz API" razem z wyglądającą
    // na działającą tabelą (pustą albo, gorzej, ostatnimi dobrymi danymi sprzed
    // awarii klucza) — mieszanie sygnałów, przed którym ostrzega AGENTS.md.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'configError' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Ostatnia aktualizacja/)).not.toBeInTheDocument()

    // Wyjście ze strony daje `TopBar` (← i ścieżka), nie sama tablica.
    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
  })

  // PR4: wiek danych jest przyciskiem „odśwież teraz”; pełna data i godzina zostają w `title`.
  it('shows the data age as a refresh button with the absolute last-updated time in its title', async () => {
    const snapshot = { ...SNAPSHOT, fetchedAt: '2026-08-01T20:24:11.827Z' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshot], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    const button = await screen.findByRole('button', { name: /^Aktualizacja .* — odśwież teraz$/ })
    expect(button).toHaveAttribute('title', 'Ostatnia aktualizacja: 01.08.2026, 22:24:11')
  })

  it('navigates to the connection-details route for the clicked train, carrying its scheduleId/orderId/operatingDate and label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'EIC 1' }))

    expect(push).toHaveBeenCalledWith('/connection/2026/12345/2026-08-01?train=EIC%201', NAV_FORWARD_OPTIONS)
  })

  it('does not make the row clickable when operatingDate is missing', async () => {
    const rowWithoutDate = { ...SNAPSHOT.departures[0], operatingDate: '' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [rowWithoutDate] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByRole('button', { name: 'EIC 1' })).not.toBeInTheDocument()
  })

  it('restores the tab straight from the URL, without a click', async () => {
    window.history.pushState({}, '', '/?tab=arrivals')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)

    // Zakładka Przyjazdy aktywna od razu -- TLK 2 widoczne, EIC 1 (odjazdy) nie.
    expect(await screen.findByText('TLK 2')).toBeInTheDocument()
    expect(screen.queryByText('EIC 1')).not.toBeInTheDocument()
  })

  it('writes the tab to the URL, and clears it when the board closes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    const { unmount } = render(
      <FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />
    )
    await user.click(await screen.findByRole('tab', { name: 'Przyjazdy' }))
    // The URL is written from a useEffect, not the click handler.
    await waitFor(() => expect(window.location.search).toContain('tab=arrivals'))

    // Odmontowanie tablicy (odpowiednik wyjścia ze strony) musi
    // wyczyścić `tab` -- inaczej kolejna, inna stacja odziedziczyłaby zakładkę
    // sprzed zamknięcia.
    unmount()
    expect(window.location.search).not.toContain('tab=')
  })

  it('shows a disruption indicator on a row flagged hasDisruption, not on a plain row', async () => {
    const disrupted = { ...SNAPSHOT.departures[0], hasDisruption: true }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [disrupted] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.getByTitle('Utrudnienie na trasie')).toBeInTheDocument()
  })

  it('does not show a disruption indicator when hasDisruption is absent (existing rows predating this field)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByTitle('Utrudnienie na trasie')).not.toBeInTheDocument()
  })

  it('offers a status legend next to the "Status" column header, revealed on focus, covering all six statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    const legendButton = screen.getByRole('button', { name: 'Legenda statusów' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(legendButton)

    const legendPanel = screen.getByRole('tooltip')
    // Zawężone do panelu legendy -- "punktualnie" istnieje też osobno w
    // plakietce statusu wiersza (SNAPSHOT ma status "onTime").
    for (const label of ['punktualnie', 'opóźniony', 'odwołany', 'brak danych', 'jeszcze nie wyjechał / nie przyjechał', 'w trasie']) {
      expect(within(legendPanel).getByText(label)).toBeInTheDocument()
    }
    // Przycisk wskazuje na panel, gdy jest otwarty (wzorzec tooltipa).
    expect(legendButton).toHaveAttribute('aria-describedby', legendPanel.id)
  })

  it('closes the status legend on Escape without moving focus off the trigger', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    const legendButton = screen.getByRole('button', { name: 'Legenda statusów' })
    fireEvent.focus(legendButton)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(legendButton, { key: 'Escape' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('has no ✕, theme toggle or share of its own; the title is h1 standalone and h2 embedded', async () => {
    // Wyjście, motyw i „Udostępnij” daje `TopBar` strony (station) albo ekran
    // nadrzędny (city) -- tablica ma tylko przypięcie.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const { rerender } = render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Przełącz na tryb/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Warszawa Centralna' })).toBeInTheDocument()

    rerender(<FullBoard embedded stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('on a wide screen the status legend sits next to the direction tabs, not in the table header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
    await screen.findByText('EIC 1')

    const legend = screen.getByRole('button', { name: 'Legenda statusów' })
    expect(within(screen.getByRole('table')).queryByRole('button', { name: 'Legenda statusów' })).toBeNull()
    expect(within(screen.getByTestId('board-tabs-bar')).getByRole('button', { name: 'Legenda statusów' })).toBe(legend)
  })

  describe('na telefonie (PR4)', () => {
    const WITH_INSIGHTS = {
      ...SNAPSHOT,
      insights: { topDestinations: [{ stationId: '80416', name: 'Kraków', count: 12 }], hourlyTraffic: Array.from({ length: 24 }, () => 1) },
    }
    // Telefon: `useMediaQuery(SM_UP)` = false (bez atrapy jsdom = „szeroko”); sprząta `unstubAllGlobals`.
    beforeEach(() => {
      window.HTMLElement.prototype.scrollTo = () => {}
      stubMatchMedia(false)
    })

    it('„Info” opens a sheet with the station context (same components as the aside) and × closes it', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [WITH_INSIGHTS], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('EIC 1')

      const info = screen.getByRole('button', { name: 'Info' })
      expect(info).toHaveAttribute('aria-expanded', 'false')
      await user.click(info)
      const sheet = screen.getByRole('dialog', { name: 'Informacje o stacji' })
      expect(within(sheet).getByText('Natężenie ruchu dzisiaj')).toBeInTheDocument()
      expect(within(sheet).getByText('Odjazdy dzisiaj')).toBeInTheDocument()
      expect(info).toHaveAttribute('aria-expanded', 'true')

      await user.click(within(sheet).getByRole('button', { name: 'Zamknij informacje' }))
      expect(screen.queryByRole('dialog', { name: 'Informacje o stacji' })).not.toBeInTheDocument()
    })

    it('on a phone the context renders once — in the Info sheet, not also in a hidden aside', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [WITH_INSIGHTS], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('EIC 1')
      expect(screen.queryByText('Natężenie ruchu dzisiaj')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Info' }))
      expect(screen.getAllByText('Natężenie ruchu dzisiaj')).toHaveLength(1)
    })

    it('the popular-destination chips are not above the table on a phone; the Info sheet list filters the board and writes ?direction=', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [WITH_INSIGHTS], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('EIC 1')
      expect(screen.queryByRole('group', { name: 'Najpopularniejsze kierunki' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Info' }))
      const sheet = screen.getByRole('dialog', { name: 'Informacje o stacji' })
      await user.click(within(sheet).getByRole('button', { name: /Kraków/ }))
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('direction')).toBe('Kraków'))
    })

    it('the status legend is in the Info sheet, not as a „?” orphan next to the tabs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('EIC 1')
      expect(screen.queryByRole('button', { name: 'Legenda statusów' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Info' }))
      const sheet = screen.getByRole('dialog', { name: 'Informacje o stacji' })
      expect(within(sheet).getByRole('heading', { name: 'Legenda statusów' })).toBeInTheDocument()
    })

    it('top row is ← name ★ ⋮: „Więcej” holds „Udostępnij” and „Informacje o stacji” (opens the sheet); name once', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} phoneBack={{ href: '/', label: 'Wróć do Pulpitu' }} />)
      await screen.findByText('EIC 1')
      expect(screen.getByRole('link', { name: 'Wróć do Pulpitu' })).toHaveAttribute('href', '/')
      expect(screen.getAllByRole('heading', { name: 'Warszawa Centralna' })).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Przypnij do Pulpitu' })).toBeInTheDocument()
      // „Udostępnij” nie stoi już osobno w karcie — jest w menu.
      expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()

      const more = screen.getByRole('button', { name: 'Więcej' })
      await user.click(more)
      const menu = screen.getByRole('list', { name: 'Więcej' })
      expect(within(menu).getByRole('button', { name: 'Udostępnij' })).toBeInTheDocument()
      await user.click(within(menu).getByRole('button', { name: 'Informacje o stacji' }))
      expect(screen.queryByRole('list', { name: 'Więcej' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Informacje o stacji' })).toBeInTheDocument()
    })

    it('no KPI tiles above the board on a phone — they stay in the Info sheet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('EIC 1')
      expect(screen.queryByTestId('station-stats')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Info' }))
      expect(within(screen.getByRole('dialog', { name: 'Informacje o stacji' })).getByTestId('station-stats')).toBeInTheDocument()
    })

    it('one direction select („Wszystkie kierunki”) built from the rows filters the board and writes ?direction=', async () => {
      const twoWays = { ...SNAPSHOT, departures: [SNAPSHOT.departures[0], { ...SNAPSHOT.departures[0], orderId: '2', trainLabel: 'IC 2', headsign: 'Gdynia Główna' }] }
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [twoWays], budget: undefined, status: 'ok' })))
      const user = userEvent.setup()
      render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isPinned={false} onTogglePin={vi.fn()} />)
      await screen.findByText('IC 2')
      const select = screen.getByRole('combobox', { name: 'Kierunek' })
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Wszystkie kierunki', 'Gdynia Główna', 'Kraków'])

      await user.selectOptions(select, 'Kraków')
      await waitFor(() => expect(screen.queryByText('IC 2')).not.toBeInTheDocument())
      expect(screen.getByText('EIC 1')).toBeInTheDocument()
      await waitFor(() => expect(new URLSearchParams(window.location.search).get('direction')).toBe('Kraków'))
    })
  })
})
