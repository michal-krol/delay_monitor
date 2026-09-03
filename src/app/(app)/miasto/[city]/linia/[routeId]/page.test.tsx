// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LineDetailPage from './page'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const params = { city: 'waw', routeId: '20' }
vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => ({ push }),
  notFound: () => notFound(),
}))

const LINE = {
  city: 'waw',
  schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'v1' },
  line: {
    routeId: '20',
    line: '20',
    longName: 'Piaski – Międzylesie',
    color: null,
    textColor: '#000000',
    mode: 'tram',
    kind: 'regular',
    directions: [
      {
        directionId: 0,
        headsign: 'Dworzec Centralny',
        origin: 'Centrum',
        stops: [
          { stopId: '100101', groupId: '1001', name: 'Centrum', wheelchair: 1 },
          { stopId: '700201', groupId: '7002', name: 'Rondo ONZ', wheelchair: 0 },
        ],
        departures: [
          { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200], frequencyBased: false },
          { category: 'saturday', times: [8 * 3600], frequencyBased: false },
        ],
      },
      {
        directionId: 1,
        headsign: 'Centrum',
        origin: 'Dworzec Centralny',
        stops: [{ stopId: '700201', groupId: '7002', name: 'Rondo ONZ', wheelchair: 0 }],
        departures: [{ category: 'weekday', times: [6 * 3600 + 600], frequencyBased: false }],
      },
    ],
  },
  attribution: ['ZTM'],
}

function stubFetch(lineBody: unknown = LINE) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/gtfs/line')
        ? jsonResponse(lineBody)
        : jsonResponse({ cities: [{ id: 'waw', name: 'Warszawa' }] })
    )
  )
}

beforeEach(() => {
  push.mockClear()
  params.city = 'waw'
  params.routeId = '20'
})
afterEach(() => vi.unstubAllGlobals())

describe('LineDetailPage', () => {
  it('calls notFound for a malformed route id', () => {
    params.routeId = 'a/b'
    expect(() => render(<LineDetailPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('shows the line, both directions as origin → destination, and links stops — never a delay', async () => {
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    // kierunek jako „skąd → dokąd"
    expect(screen.getByRole('heading', { name: /Centrum.*Dworzec Centralny/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Dworzec Centralny.*Centrum/ })).toBeInTheDocument()
    // sekcje rozkładu per kategoria dnia
    expect(screen.getAllByRole('heading', { name: 'Dni robocze' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'Soboty' })).toBeInTheDocument()
    const stop = screen.getAllByRole('link', { name: 'Centrum' })[0]
    expect(stop).toHaveAttribute('href', '/miasto/waw/przystanek/1001?nazwa=Centrum')
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('explains an unknown line instead of rendering an empty page', async () => {
    stubFetch({ ...LINE, line: null })
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie znaleziono takiej linii w rozkładzie.')).toBeInTheDocument()
  })

  it('says the schedule is still loading when the feed is not ready', async () => {
    stubFetch({ ...LINE, line: null, schedule: { ...LINE.schedule, state: 'loading' } })
    render(<LineDetailPage />)
    expect(await screen.findByText('Rozkład jeszcze się wczytuje.')).toBeInTheDocument()
  })

  it('shows an error state when the line fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/line') ? Promise.reject(new Error('x')) : jsonResponse({ cities: [] }))))
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
  })
})
