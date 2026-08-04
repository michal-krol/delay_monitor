// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullBoard } from './FullBoard'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

const SNAPSHOT = {
  stationId: '5100',
  stationName: 'Warszawa Centralna',
  departures: [
    { trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', category: 'EIC', headsign: 'Kraków', plannedAt: new Date().toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' },
  ],
  arrivals: [
    { trainNumber: '2', trainLabel: 'TLK 2', carrier: 'IC', category: 'TLK', headsign: 'Gdynia', plannedAt: new Date().toISOString(), actualAt: null, delayMinutes: 0, status: 'unknown', platform: null },
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

  it('dims the train name, direction and time for a departure that already passed, but keeps the status badge full color', async () => {
    const past = { ...SNAPSHOT.departures[0], trainLabel: 'PAST1', plannedAt: new Date(Date.now() - 2 * 60000).toISOString() }
    const future = { ...SNAPSHOT.departures[0], trainNumber: '2', trainLabel: 'FUTURE2', plannedAt: new Date(Date.now() + 10 * 60000).toISOString() }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => jsonResponse({ snapshots: [{ ...SNAPSHOT, departures: [past, future] }], budget: undefined, status: 'ok' }))
    )

    render(<FullBoard stationId="5100" stationName="Warszawa Centralna" isFavourite={false} onToggleFavourite={vi.fn()} onClose={vi.fn()} />)
    await screen.findByText('PAST1')

    expect(screen.getByText('PAST1')).toHaveClass('text-gray-400')
    expect(screen.getByText('FUTURE2')).not.toHaveClass('text-gray-400')

    const pastRow = screen.getAllByRole('row').find((r) => within(r).queryByText('PAST1'))
    const futureRow = screen.getAllByRole('row').find((r) => within(r).queryByText('FUTURE2'))
    expect(within(pastRow!).getByText('punktualnie')).not.toHaveClass('text-gray-400')
    expect(within(futureRow!).getByText('punktualnie')).not.toHaveClass('text-gray-400')
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
})
