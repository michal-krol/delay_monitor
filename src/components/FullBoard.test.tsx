// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullBoard } from './FullBoard'
import { jsonResponse } from '@/test-utils/http'

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
  it('renders a table with caption and scoped headers, defaulting to departures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    await screen.findByText('EIC 1')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('EIC 1'))
    expect(row).toHaveTextContent('—')
  })

  it('shows the carrier name once, not duplicated into breakpoint variants', async () => {
    const snapshotWithName = { ...SNAPSHOT, departures: [{ ...SNAPSHOT.departures[0], carrierName: 'PKP Intercity' }] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshotWithName], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('EIC 1')

    // Wcześniej kod i pełna nazwa renderowały się OBA, przełączane klasami
    // `sm:hidden`/`hidden sm:inline` -- czytnik ekranu czytał przewoźnika
    // dwa razy. Teraz jest jeden element: pełna nazwa, z kodem jako rezerwą.
    expect(screen.getByText('PKP Intercity')).toBeInTheDocument()
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })

  it('shows the platform and track column on narrow screens too, no longer hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('PAST1')

    const pastRow = screen.getAllByRole('row').find((r) => within(r).queryByText('PAST1'))
    const futureRow = screen.getAllByRole('row').find((r) => within(r).queryByText('FUTURE2'))
    expect(pastRow).toHaveClass('opacity-50')
    expect(futureRow).not.toHaveClass('opacity-50')
  })

  it('switches to arrivals when the arrivals tab is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    expect(await screen.findByText('EIC 1')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('TLK 2')).toBeInTheDocument()
    expect(screen.queryByText('EIC 1')).not.toBeInTheDocument()
  })

  it('uses direction-aware wording for a not-yet-happened connection: "jeszcze nie wyjechał" for departures, "jeszcze nie przyjechał" for arrivals', async () => {
    const notStartedSnapshot = {
      ...SNAPSHOT,
      departures: [{ ...SNAPSHOT.departures[0], status: 'notStarted', delayMinutes: null }],
      arrivals: [{ ...SNAPSHOT.arrivals[0], status: 'notStarted', delayMinutes: null }],
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [notStartedSnapshot], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    expect(await screen.findByText('w trasie, ~+30 min')).toBeInTheDocument()
    expect(screen.getByText('w trasie')).toBeInTheDocument()
  })

  it('names the right direction in the empty-board message', async () => {
    const empty = { ...SNAPSHOT, departures: [], arrivals: [] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [empty], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    expect(await screen.findByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('Brak przyjazdów w najbliższych godzinach')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w najbliższych godzinach')).not.toBeInTheDocument()
  })

  it('shows the correct favourite toggle label and calls the handler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const onToggleFavourite = vi.fn()
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={onToggleFavourite} />)
    await user.click(screen.getByRole('button', { name: 'Przypnij do Pulpitu' }))

    expect(onToggleFavourite).toHaveBeenCalled()
  })

  it('hides the tabs and table behind the config-error banner', async () => {
    // Bez tego użytkownik widziałby baner "sprawdź klucz API" razem z wyglądającą
    // na działającą tabelą (pustą albo, gorzej, ostatnimi dobrymi danymi sprzed
    // awarii klucza) — mieszanie sygnałów, przed którym ostrzega AGENTS.md.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'configError' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Ostatnia aktualizacja/)).not.toBeInTheDocument()

    // Wyjście ze strony daje `TopBar` (← i ścieżka), nie sama tablica.
    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
  })

  it('shows the absolute last-updated date and time instead of a relative age', async () => {
    const snapshot = { ...SNAPSHOT, fetchedAt: '2026-08-01T20:24:11.827Z' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshot], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    expect(await screen.findByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.queryByText(/^\d+s$/)).not.toBeInTheDocument()
  })

  it('navigates to the connection-details route for the clicked train, carrying its scheduleId/orderId/operatingDate and label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'EIC 1' }))

    expect(push).toHaveBeenCalledWith('/connection/2026/12345/2026-08-01?train=EIC%201')
  })

  it('does not make the row clickable when operatingDate is missing', async () => {
    const rowWithoutDate = { ...SNAPSHOT.departures[0], operatingDate: '' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [rowWithoutDate] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByRole('button', { name: 'EIC 1' })).not.toBeInTheDocument()
  })

  it('restores the tab straight from the URL, without a click', async () => {
    window.history.pushState({}, '', '/?tab=arrivals')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)

    // Zakładka Przyjazdy aktywna od razu -- TLK 2 widoczne, EIC 1 (odjazdy) nie.
    expect(await screen.findByText('TLK 2')).toBeInTheDocument()
    expect(screen.queryByText('EIC 1')).not.toBeInTheDocument()
  })

  it('writes the tab to the URL, and clears it when the board closes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    const { unmount } = render(
      <FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.getByTitle('Utrudnienie na trasie')).toBeInTheDocument()
  })

  it('does not show a disruption indicator when hasDisruption is absent (existing rows predating this field)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByTitle('Utrudnienie na trasie')).not.toBeInTheDocument()
  })

  it('offers a status legend next to the "Status" column header, revealed on focus, covering all six statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
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
    const { rerender } = render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByRole('button', { name: 'Zamknij' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Przełącz na tryb/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Warszawa Centralna' })).toBeInTheDocument()

    rerender(<FullBoard embedded stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
