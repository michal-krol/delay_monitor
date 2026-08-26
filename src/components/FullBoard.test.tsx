// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullBoard } from './FullBoard'
import { jsonResponse } from '@/test-utils/http'

// Szczegóły połączenia mają teraz własną trasę (`/polaczenie/...`) — klik w
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('EIC 1')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: 'Przewoźnik' })).toBeInTheDocument()
    expect(screen.queryByText('TLK 2')).not.toBeInTheDocument()
  })

  it('shows the carrier logo next to the code for a known carrier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    await screen.findByText('EIC 1')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('EIC 1'))
    expect(row).toHaveTextContent('—')
  })

  it('keeps the carrier code and full name in separate elements toggled by breakpoint, so mobile can show just the code', async () => {
    const snapshotWithName = { ...SNAPSHOT, departures: [{ ...SNAPSHOT.departures[0], carrierName: 'PKP Intercity' }] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshotWithName], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.getByRole('columnheader', { name: 'Przewoźnik' })).not.toHaveClass('hidden')

    const shortCode = screen.getByText('IC')
    const fullName = screen.getByText('PKP Intercity')
    expect(shortCode).toHaveClass('sm:hidden')
    expect(fullName).toHaveClass('hidden', 'sm:inline')
  })

  it('shows the Peron/Tor column on narrow screens too, no longer hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.getByRole('columnheader', { name: 'Peron/Tor' })).not.toHaveClass('hidden')
  })

  it('dims the whole row -- train name, carrier, direction, time and status badge -- for a departure that already passed', async () => {
    const past = { ...SNAPSHOT.departures[0], trainLabel: 'PAST1', plannedAt: new Date(Date.now() - 2 * 60000).toISOString() }
    const future = { ...SNAPSHOT.departures[0], trainNumber: '2', trainLabel: 'FUTURE2', plannedAt: new Date(Date.now() + 10 * 60000).toISOString() }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [past, future] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('PAST1')

    const pastRow = screen.getAllByRole('row').find((r) => within(r).queryByText('PAST1'))
    const futureRow = screen.getAllByRole('row').find((r) => within(r).queryByText('FUTURE2'))
    expect(pastRow).toHaveClass('opacity-50')
    expect(futureRow).not.toHaveClass('opacity-50')
  })

  it('switches to arrivals when the arrivals tab is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
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

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('w trasie, ~+30 min')).toBeInTheDocument()
    expect(screen.getByText('w trasie')).toBeInTheDocument()
  })

  it('names the right direction in the empty-board message', async () => {
    const empty = { ...SNAPSHOT, departures: [], arrivals: [] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [empty], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('Brak przyjazdów w najbliższych godzinach')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w najbliższych godzinach')).not.toBeInTheDocument()
  })

  it('shows the correct favourite toggle label and calls the handler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const onToggleFavourite = vi.fn()
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={onToggleFavourite} onClose={vi.fn()} />)
    await user.click(screen.getByText('Dodaj do ulubionych'))

    expect(onToggleFavourite).toHaveBeenCalled()
  })

  it('hides the tabs and table behind the config-error banner, but keeps a way out', async () => {
    // Bez tego użytkownik widziałby baner "sprawdź klucz API" razem z wyglądającą
    // na działającą tabelą (pustą albo, gorzej, ostatnimi dobrymi danymi sprzed
    // awarii klucza) — mieszanie sygnałów, przed którym ostrzega AGENTS.md.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'configError' }))
    )
    const onClose = vi.fn()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={onClose} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Ostatnia aktualizacja/)).not.toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: 'Zamknij' })
    await userEvent.setup().click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the absolute last-updated date and time instead of a relative age', async () => {
    const snapshot = { ...SNAPSHOT, fetchedAt: '2026-08-01T20:24:11.827Z' }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [snapshot], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText(/Ostatnia aktualizacja:/)).toBeInTheDocument()
    expect(screen.queryByText(/^\d+s$/)).not.toBeInTheDocument()
  })

  it('navigates to the connection-details route for the clicked train, carrying its scheduleId/orderId/operatingDate and label', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'EIC 1' }))

    expect(push).toHaveBeenCalledWith('/polaczenie/2026/12345/2026-08-01?train=EIC%201')
  })

  it('does not make the row clickable when operatingDate is missing', async () => {
    const rowWithoutDate = { ...SNAPSHOT.departures[0], operatingDate: '' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [rowWithoutDate] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByRole('button', { name: 'EIC 1' })).not.toBeInTheDocument()
  })

  it('restores the tab straight from the URL, without a click', async () => {
    window.history.pushState({}, '', '/?tab=arrivals')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)

    // Zakładka Przyjazdy aktywna od razu -- TLK 2 widoczne, EIC 1 (odjazdy) nie.
    expect(await screen.findByText('TLK 2')).toBeInTheDocument()
    expect(screen.queryByText('EIC 1')).not.toBeInTheDocument()
  })

  it('writes the tab to the URL, and clears it when the board closes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { unmount } = render(
      <FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={onClose} />
    )
    await user.click(await screen.findByRole('tab', { name: 'Przyjazdy' }))
    expect(window.location.search).toContain('tab=arrivals')

    // Odmontowanie tablicy (odpowiednik kliknięcia "Zamknij" w page.tsx) musi
    // wyczyścić `tab` -- inaczej kolejna, inna stacja odziedziczyłaby zakładkę
    // sprzed zamknięcia.
    unmount()
    expect(window.location.search).not.toContain('tab=')
  })

  it('copies the current URL to the clipboard and shows a confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // Po `userEvent.setup()`, nie przed -- ono samo ustawia własną atrapę
    // `navigator.clipboard` (na potrzeby symulacji kopiuj/wklej), więc
    // wcześniejsze przypisanie zostałoby nadpisane.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')
    await user.click(screen.getByRole('button', { name: 'Kopiuj link' }))

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByRole('status')).toHaveTextContent('Skopiowano link')
  })

  it('shows a manual-copy hint instead of failing silently when the Clipboard API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')
    await user.click(screen.getByRole('button', { name: 'Kopiuj link' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/link w pasku adresu/)
  })

  it('shows a disruption indicator on a row flagged hasDisruption, not on a plain row', async () => {
    const disrupted = { ...SNAPSHOT.departures[0], hasDisruption: true }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [disrupted] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.getByTitle('Utrudnienie na trasie')).toBeInTheDocument()
  })

  it('does not show a disruption indicator when hasDisruption is absent (existing rows predating this field)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('EIC 1')

    expect(screen.queryByTitle('Utrudnienie na trasie')).not.toBeInTheDocument()
  })

  it('offers a status legend next to the "Status" column header, revealed on focus, covering all six statuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [SNAPSHOT], budget: undefined, status: 'ok' })))

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
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
  })
})
