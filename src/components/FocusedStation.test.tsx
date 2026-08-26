// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusedStation } from './FocusedStation'
import type { BoardApiSnapshot } from '@/hooks/useBoard'

// BoardTable (rendered by FocusedStation) navigates to connection details via useRouter().
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  push.mockClear()
})

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

describe('FocusedStation', () => {
  it('shows the station name and a tab bar defaulting to Odjazdy', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} configError={false} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Odjazdy' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Przyjazdy' })).toHaveAttribute('aria-selected', 'false')
  })

  it('renders a full table -- columnheaders, carrier logo, click-through to connection details', async () => {
    const departure = { scheduleId: '2026', orderId: '12345', operatingDate: '2026-08-01', trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', categoryName: null, headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1', estimatedDelayMinutes: null }
    const snapshot = makeSnapshot({ departures: [departure] })
    const user = userEvent.setup()

    render(<FocusedStation stationName="Warszawa Centralna" snapshot={snapshot} configError={false} onClose={vi.fn()} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Przewoźnik' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EIC 1' }))
    expect(push).toHaveBeenCalledWith('/polaczenie/2026/12345/2026-08-01?train=EIC%201')
  })

  it('switches between departures and arrivals via the tab bar, like the full board', async () => {
    const departure = { scheduleId: '1', orderId: '1', operatingDate: '2026-08-01', trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', categoryName: null, headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1', estimatedDelayMinutes: null }
    const arrival = { scheduleId: '2', orderId: '2', operatingDate: '2026-08-01', trainNumber: '2', trainLabel: 'EIC 2', carrier: 'KM', carrierName: null, category: 'REG', categoryName: null, headsign: 'Gdańsk', plannedAt: new Date(Date.now() + 10 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '2', estimatedDelayMinutes: null }
    const snapshot = makeSnapshot({ departures: [departure], arrivals: [arrival] })
    const user = userEvent.setup()

    render(<FocusedStation stationName="Warszawa Centralna" snapshot={snapshot} configError={false} onClose={vi.fn()} />)

    // Kod przewoźnika renderuje się dwukrotnie (warianty sm:hidden/sm:inline
    // dla różnych szerokości ekranu) -- stąd getAllByText, nie getByText.
    expect(screen.getAllByText('IC').length).toBeGreaterThan(0)
    expect(screen.queryByText('KM')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getAllByText('KM').length).toBeGreaterThan(0)
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })

  it('dims a connection that already happened instead of hiding it, like the full board', () => {
    const past = { scheduleId: '1', orderId: '1', operatingDate: '2026-08-01', trainNumber: '1', trainLabel: 'PAST1', carrier: 'IC', carrierName: null, category: 'EIC', categoryName: null, headsign: 'Kraków', plannedAt: new Date(Date.now() - 2 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1', estimatedDelayMinutes: null }
    const snapshot = makeSnapshot({ departures: [past] })

    render(<FocusedStation stationName="Warszawa Centralna" snapshot={snapshot} configError={false} onClose={vi.fn()} />)

    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('PAST1'))
    expect(row).toHaveClass('opacity-50')
  })

  it('shows all upcoming rows, not just the nearest few', () => {
    const departures = Array.from({ length: 8 }, (_, i) => ({
      scheduleId: String(i), orderId: String(i), operatingDate: '2026-08-01', trainNumber: String(i), trainLabel: `EIC ${i}`,
      carrier: 'IC', carrierName: null, category: 'EIC', categoryName: null, headsign: 'Kraków', plannedAt: new Date(Date.now() + (i + 1) * 60000).toISOString(),
      actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1', estimatedDelayMinutes: null,
    }))
    const snapshot = makeSnapshot({ departures })

    render(<FocusedStation stationName="Warszawa Centralna" snapshot={snapshot} configError={false} onClose={vi.fn()} />)

    for (const departure of departures) {
      expect(screen.getByText(departure.trainLabel)).toBeInTheDocument()
    }
  })

  it('shows a loading message, not "brak odjazdów", when there is no snapshot yet', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={null} configError={false} onClose={vi.fn()} />)

    expect(screen.getByText('Ładowanie…')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w najbliższych godzinach')).not.toBeInTheDocument()
  })

  it('shows an empty message per active tab', async () => {
    const user = userEvent.setup()
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} configError={false} onClose={vi.fn()} />)

    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('Brak przyjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('renders a config error banner instead of the tab bar and table, but keeps "Zamknij" usable', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={null} configError={true} onClose={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeInTheDocument()
  })

  it('calls onClose when "Zamknij" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} configError={false} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Zamknij' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
