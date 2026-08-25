// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FocusedStation } from './FocusedStation'
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

describe('FocusedStation', () => {
  it('shows the station name and a tab bar defaulting to Odjazdy', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} error={false} configError={false} onSeeAll={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Odjazdy' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Przyjazdy' })).toHaveAttribute('aria-selected', 'false')
  })

  it('switches between departures and arrivals via the tab bar, like the full board', async () => {
    const departure = { scheduleId: '1', orderId: '1', operatingDate: '2026-08-01', trainNumber: '1', trainLabel: 'EIC 1', carrier: 'IC', carrierName: null, category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '1', estimatedDelayMinutes: null }
    const arrival = { scheduleId: '2', orderId: '2', operatingDate: '2026-08-01', trainNumber: '2', trainLabel: 'EIC 2', carrier: 'KM', carrierName: null, category: 'REG', headsign: 'Gdańsk', plannedAt: new Date(Date.now() + 10 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime' as const, platform: '2', estimatedDelayMinutes: null }
    const snapshot = makeSnapshot({ departures: [departure], arrivals: [arrival] })
    const user = userEvent.setup()

    render(<FocusedStation stationName="Warszawa Centralna" snapshot={snapshot} error={false} configError={false} onSeeAll={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('IC')).toBeInTheDocument()
    expect(screen.queryByText('KM')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('KM')).toBeInTheDocument()
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })

  it('calls onSeeAll when "Zobacz wszystkie" is clicked', async () => {
    const onSeeAll = vi.fn()
    const user = userEvent.setup()
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} error={false} configError={false} onSeeAll={onSeeAll} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Zobacz wszystkie' }))

    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "Zamknij" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} error={false} configError={false} onSeeAll={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Zamknij' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a loading message when there is no snapshot yet', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={null} error={false} configError={false} onSeeAll={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Ładowanie…')).toBeInTheDocument()
  })

  it('shows an empty message instead of an error when there are no upcoming rows, per active tab', async () => {
    const user = userEvent.setup()
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={makeSnapshot()} error={false} configError={false} onSeeAll={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Przyjazdy' }))

    expect(screen.getByText('Brak przyjazdów w najbliższych godzinach')).toBeInTheDocument()
  })

  it('renders a config error banner instead of the tab bar and row list, but keeps the header buttons usable', () => {
    render(<FocusedStation stationName="Warszawa Centralna" snapshot={null} error={false} configError={true} onSeeAll={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zobacz wszystkie' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zamknij' })).toBeInTheDocument()
  })
})
