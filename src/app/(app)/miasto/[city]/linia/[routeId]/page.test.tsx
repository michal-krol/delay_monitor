// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
          { stopId: '100101', groupId: '1001', name: 'Centrum', wheelchair: 1, offsetSec: 0 },
          { stopId: '700201', groupId: '7002', name: 'Rondo ONZ', wheelchair: 0, offsetSec: 480 },
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
        stops: [{ stopId: '500801', groupId: '5008', name: 'Dworzec Centralny', wheelchair: 0, offsetSec: 0 }],
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

  it('shows one direction with a multi-column timetable, and a link to the stop board — never a delay', async () => {
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    // kierunek jako „skąd → dokąd" na przycisku przełącznika
    expect(screen.getByRole('button', { name: 'Zmień kierunek' })).toHaveTextContent('Centrum')
    expect(screen.getByRole('button', { name: 'Zmień kierunek' })).toHaveTextContent('Dworzec Centralny')
    // kolumny rozkładu obok siebie — sobota nie pod dniami roboczymi
    expect(screen.getByRole('columnheader', { name: 'Poniedziałek – Piątek' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    // pełna trasa widoczna od razu (bez rozwijania), z linkiem do tablicy przystanku
    expect(screen.getByRole('link', { name: /pełna tablica przystanku/ })).toHaveAttribute(
      'href',
      '/miasto/waw/przystanek/1001?nazwa=Centrum'
    )
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('switches direction with the toggle', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('heading', { name: 'Trasa linii' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rozkład — Centrum' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(screen.getByRole('heading', { name: 'Rozkład — Dworzec Centralny' })).toBeInTheDocument()
  })

  it('highlights a picked departure across every stop of the route (start + travel offset)', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    // wybór odjazdu 06:00 z przystanku startowego (Centrum)
    await user.click(screen.getByRole('button', { name: '06:00' }))
    // Rondo ONZ (+480 s) pokazuje 06:08 na trasie
    expect(screen.getByText('06:08')).toBeInTheDocument()
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
