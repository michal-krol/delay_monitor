// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransitStopCard } from './TransitStopCard'
import { jsonResponse } from '@/test-utils/http'

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...a: unknown[]) => useTransitBoard(...a) }))

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
    useTransitBoard.mockReturnValue({ data: null, error: null })
    const onRemove = vi.fn()
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /Odepnij z Pulpitu/ }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit error when the schedule could not load', () => {
    useTransitBoard.mockReturnValue({ data: null, error: 'network' })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.getByText('Nie udało się wczytać rozkładu')).toBeInTheDocument()
  })

  it('shows loading, not the empty message, while GTFS is still loading', () => {
    useTransitBoard.mockReturnValue({
      data: { stops: [null], schedule: { state: 'loading' }, attribution: [] },
      error: null,
    })
    const { container } = render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.queryByText('Nie udało się wczytać rozkładu')).not.toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it("shows the city's display name, not the slug, once /api/cities resolves", async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null })
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa' }] })))
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(await screen.findByText('Rozkład — Warszawa')).toBeInTheDocument()
  })
})
