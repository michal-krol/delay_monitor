// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityLinesPage from './page'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let cityParam = 'warszawa'
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push }),
  notFound: () => notFound(),
}))

const LINES = {
  city: 'warszawa',
  schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'v1' },
  lines: {
    metro: [{ routeId: 'M1', line: 'M1', longName: 'Kabaty – Młociny', color: null, textColor: '#000000', mode: 'metro', kind: 'regular' }],
    tram: [{ routeId: '20', line: '20', longName: 'Piaski', color: null, textColor: '#000000', mode: 'tram', kind: 'regular' }],
    bus: [],
    rail: [],
    other: [],
  },
  attribution: ['ZTM'],
}

function stubFetch(linesBody: unknown = LINES) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/gtfs/lines')
        ? jsonResponse(linesBody)
        : jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa' }] })
    )
  )
}

beforeEach(() => {
  push.mockClear()
  cityParam = 'warszawa'
})
afterEach(() => vi.unstubAllGlobals())

describe('CityLinesPage', () => {
  it('calls notFound for a malformed city id', () => {
    cityParam = 'a/b'
    expect(() => render(<CityLinesPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('lists lines grouped by mode and links each to its route page', async () => {
    stubFetch()
    render(<CityLinesPage />)
    const link = await screen.findByRole('link', { name: /Linia M1/ })
    expect(link).toHaveAttribute('href', '/miasto/warszawa/linia/M1')
    expect(await screen.findByRole('heading', { name: 'Trasy — Warszawa' })).toBeInTheDocument()
    expect(screen.getByText('Przeglądarka linii komunikacji miejskiej')).toBeInTheDocument()
  })

  it('filters the grid by a text query on line number or headsign', async () => {
    stubFetch({
      ...LINES,
      lines: {
        ...LINES.lines,
        bus: [{ routeId: '128', line: '128', longName: 'Chomiczówka – Dworzec', color: null, textColor: '#000000', mode: 'bus', kind: 'regular' }],
      },
    })
    const user = userEvent.setup()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    await user.type(screen.getByRole('searchbox', { name: /szukaj linii/i }), '128')
    expect(screen.queryByRole('link', { name: /Linia M1/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Linia 128/ })).toBeInTheDocument()
  })

  it('renders the city picker in the top bar (line-browser navigation target)', async () => {
    stubFetch()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(screen.getByRole('combobox', { name: /miasto/i })).toBeInTheDocument()
  })

  it('filters the grid when a mode chip is pressed', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    await user.click(screen.getByRole('button', { name: 'tramwaj' }))
    expect(screen.queryByRole('link', { name: /Linia M1/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Linia 20/ })).toBeInTheDocument()
  })

  it('shows a loading note while the schedule is still warming up', async () => {
    stubFetch({ ...LINES, schedule: { ...LINES.schedule, state: 'loading' }, lines: null })
    render(<CityLinesPage />)
    expect(await screen.findByText('Rozkład jeszcze się wczytuje.')).toBeInTheDocument()
  })

  it('shows an error state when the lines fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/lines') ? Promise.reject(new Error('x')) : jsonResponse({ cities: [] }))))
    render(<CityLinesPage />)
    expect(await screen.findByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
  })
})
