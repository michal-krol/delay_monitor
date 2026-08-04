// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StationCard } from './StationCard'
import type { BoardApiSnapshot } from '@/hooks/useBoard'

function makeSnapshot(overrides: Partial<BoardApiSnapshot> = {}): BoardApiSnapshot {
  return {
    stationId: '5100',
    stationName: 'Warszawa Centralna',
    departures: [],
    arrivals: [],
    fetchedAt: new Date().toISOString(),
    ageMs: 1000,
    ...overrides,
  }
}

describe('StationCard', () => {
  it('shows the station name and up to 3 departures with delay text (not color-only)', () => {
    const snapshot = makeSnapshot({
      departures: [
        { trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 5, status: 'delayed', platform: '1' },
      ],
    })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('Warszawa Centralna')).toBeInTheDocument()
    expect(screen.getByText('+5 min')).toBeInTheDocument()
  })

  it('shows the carrier name as text and the logo as a decorative image', () => {
    const snapshot = makeSnapshot({
      departures: [
        { trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: 'PKP Intercity', category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' },
      ],
    })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('PKP Intercity')).toBeInTheDocument()

    // Logo jest dekoracyjne: nazwa przewoźnika stoi obok jako tekst, więc
    // opisowy alt kazałby czytnikowi ekranu przeczytać ją dwa razy. Pusty alt
    // wyklucza obraz z drzewa dostępności, więc getByRole('img', ...) go nie
    // znajdzie — document.querySelector jest tu jedyną opcją.
    // eslint-disable-next-line testing-library/no-node-access
    const logo = document.querySelector('img[src="/carriers/pkp-ic.svg"]')
    expect(logo).not.toBeNull()
    expect(logo).toHaveAttribute('alt', '')
  })

  it('falls back to a generic label when the carrier code is empty', () => {
    const snapshot = makeSnapshot({
      departures: [
        { trainNumber: '26-1', trainLabel: '26-1', carrier: '', carrierName: null, category: '', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: null },
      ],
    })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('Nieznany przewoźnik')).toBeInTheDocument()
  })

  it('shows the departure time for each of the 3 nearest departures', () => {
    const plannedAt = new Date(Date.now() + 15 * 60000).toISOString()
    const expectedTime = new Date(plannedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    const snapshot = makeSnapshot({
      departures: [
        { trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt, actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' },
      ],
    })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText(expectedTime)).toBeInTheDocument()
  })

  it('excludes departures that already passed, keeping only upcoming ones (past ones stay in FullBoard only)', () => {
    const past = { trainNumber: '1', trainLabel: 'PAST1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() - 2 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1' }
    const future = { trainNumber: '2', trainLabel: 'FUTURE2', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 10 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1' }
    const snapshot = makeSnapshot({ departures: [past, future] })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('FUTURE2')
    expect(list).not.toHaveTextContent('PAST1')
  })

  it('shows fewer than 3 upcoming departures rather than backfilling with a past one', () => {
    const past = { trainNumber: '1', trainLabel: 'PAST1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() - 2 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1' }
    const snapshot = makeSnapshot({ departures: [past] })

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.queryByText('PAST1')).not.toBeInTheDocument()
    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('inflects the delayed counter for Polish grammar', () => {
    const departure = (status: 'delayed' | 'onTime') => ({
      trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków',
      plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 5, status, platform: null,
    })

    const cases: Array<[number, string]> = [
      [1, '1 opóźniony'],
      [2, '2 opóźnione'],
      [5, '5 opóźnionych'],
    ]

    for (const [count, expected] of cases) {
      const snapshot = makeSnapshot({ departures: Array.from({ length: count }, () => departure('delayed')) })
      const { unmount } = render(
        <StationCard stationId="5100" stationName="X" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />
      )
      expect(screen.getByText(expected)).toBeInTheDocument()
      unmount()
    }
  })

  it('keeps the station name as a heading rather than swallowing it into the button', () => {
    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={null} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pokaż pełną tablicę: Warszawa Centralna' })).toBeInTheDocument()
  })

  it('calls onExpand with the station id and name when clicked', async () => {
    const onExpand = vi.fn()
    const user = userEvent.setup()

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={null} error={false} configError={false} onExpand={onExpand} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Pokaż pełną tablicę: Warszawa Centralna' }))

    expect(onExpand).toHaveBeenCalledWith({ id: '5100', name: 'Warszawa Centralna' })
  })

  it('removes the station from favourites without also expanding it', async () => {
    const onRemove = vi.fn()
    const onExpand = vi.fn()
    const user = userEvent.setup()

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={null} error={false} configError={false} onExpand={onExpand} onRemove={onRemove} />)
    await user.click(screen.getByRole('button', { name: 'Usuń z ulubionych: Warszawa Centralna' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
    // Przycisk usuwania leży na nakładce rozwijającej tablicę — klik w niego
    // nie może dodatkowo otwierać stacji.
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('shows a loading message when there is no snapshot yet', () => {
    render(<StationCard stationId="5100" stationName="X" snapshot={null} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Ładowanie…')).toBeInTheDocument()
  })

  it('shows the empty-station message instead of an error when there are no departures', () => {
    const snapshot = makeSnapshot({ stationName: 'X', departures: [] })
    render(<StationCard stationId="5100" stationName="X" snapshot={snapshot} error={false} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('shows an error message without hiding the last known snapshot', () => {
    const snapshot = makeSnapshot({
      departures: [
        { trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: 'PKP Intercity', category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' },
      ],
    })
    render(<StationCard stationId="5100" stationName="X" snapshot={snapshot} error={true} configError={false} onExpand={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Błąd pobierania danych')).toBeInTheDocument()
    expect(screen.getByText('PKP Intercity')).toBeInTheDocument()
  })

  it('renders a config error banner instead of the card when configError is true', () => {
    render(<StationCard stationId="5100" stationName="X" snapshot={null} error={false} configError={true} onExpand={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
