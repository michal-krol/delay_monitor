// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TransitStopPage from './page'

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const params = { city: 'warszawa', stopId: '7014M' }
vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('nazwa=Centrum'),
  notFound: () => notFound(),
}))

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: () => useTransitBoard() }))

beforeEach(() => {
  params.city = 'warszawa'
  params.stopId = '7014M'
  window.localStorage.clear()
  useTransitBoard.mockReturnValue({
    data: {
      city: 'warszawa',
      schedule: { state: 'ready', loadedAt: '2026-09-02T09:00:00.000Z', ageMs: 1000, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'v1' },
      stops: [
        {
          stopId: '7014M',
          name: 'Świętokrzyska',
          modes: ['metro', 'tram'],
          lines: [
            { routeId: 'M1', line: 'M1', color: '#0000bb', mode: 'metro' },
            { routeId: '20', line: '20', color: null, mode: 'tram' },
          ],
          summary: { lineCount: 2, departuresToday: 44, firstDepartureSec: 18000, lastDepartureSec: 90600, hourly: new Array(24).fill(2) },
          departures: [
            { tripId: 'm', routeId: 'M1', line: 'M1', mode: 'metro', color: '#0000bb', headsign: 'Kabaty', plannedAt: '2026-09-02T14:30:00+02:00', departureSec: 52200, serviceDate: '2026-09-02', stopId: '7014M', platformCode: null, wheelchair: 1, frequencyBased: true },
          ],
        },
      ],
      attribution: ['ZTM', 'Mikołaj Kuranowski'],
    },
    error: null,
  })
})

describe('TransitStopPage', () => {
  it('shows the board, the schedule status, and the attribution — never a delay', () => {
    render(<TransitStopPage />)
    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText('14:30')).toBeInTheDocument()
    expect(screen.getByText(/metro · tramwaj/)).toBeInTheDocument()
    expect(screen.getByText(/ZTM · Mikołaj Kuranowski/)).toBeInTheDocument()
    expect(screen.queryByText(/opóźni|na czas/i)).not.toBeInTheDocument()
  })

  it('pins the stop to the Pulpit as a gtfs favourite carrying its city', async () => {
    render(<TransitStopPage />)
    await userEvent.click(screen.getByRole('button', { name: /Przypnij do Pulpitu/ }))
    const stored = JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')
    expect(stored).toEqual([{ kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }])
  })

  it('calls notFound for a malformed stop id', () => {
    params.stopId = '..'
    expect(() => render(<TransitStopPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('shows loading skeletons and the name from the link before the board arrives', () => {
    useTransitBoard.mockReturnValue({ data: null, error: null })
    const { container } = render(<TransitStopPage />)
    // Nazwa z `?nazwa=` w nagłówku, dopóki tablica się nie wczyta.
    expect(screen.getByRole('heading', { name: 'Centrum' })).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
