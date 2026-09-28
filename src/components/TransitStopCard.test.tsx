// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitStopCard } from './TransitStopCard'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...a: unknown[]) => useTransitBoard(...a) }))

beforeEach(() => resetCitiesCacheForTests())
afterEach(() => vi.unstubAllGlobals())

describe('TransitStopCard', () => {
  it('shows the stop name, a schedule label (not "na czas"), and links to the stop page', () => {
    useTransitBoard.mockReturnValue({
      data: {
        stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }],
        schedule: { state: 'ready' },
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText(/Rozkład — warszawa/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pokaż przystanek/ })).toHaveAttribute(
      'href',
      '/city/warszawa/stop/7014M'
    )
  })

  it('calls onRemove without following the card link', async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
    const onRemove = vi.fn()
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /Odepnij z Pulpitu/ }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit error when the schedule could not load', () => {
    useTransitBoard.mockReturnValue({ data: null, error: 'network', loading: false, failed: true })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
  })

  it('shows the failed message, not the empty one, when the server failed to load the schedule', () => {
    useTransitBoard.mockReturnValue({
      data: { schedule: { state: 'failed' }, stops: [], attribution: [] },
      error: null,
      loading: false,
      failed: true,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
  })

  it('shows loading, not the empty message, while GTFS is still loading', () => {
    useTransitBoard.mockReturnValue({
      data: { stops: [null], schedule: { state: 'loading' }, attribution: [] },
      error: null,
      loading: true,
      failed: false,
    })
    const { container } = render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows the empty schedule message, not failed, when the board is ready with zero departures', () => {
    useTransitBoard.mockReturnValue({
      data: {
        stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }],
        schedule: { state: 'ready' },
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
  })

  it("shows the city's display name, not the slug, once /api/cities resolves", async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa' }] })))
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(await screen.findByText('Rozkład — Warszawa')).toBeInTheDocument()
  })
})
