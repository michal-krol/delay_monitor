// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityLinesPage from './page'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
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
        : jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })
    )
  )
}

beforeEach(() => {
  resetCitiesCacheForTests()
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
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
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

  it('keeps retrying past the first ladder while the schedule is still loading (never gives up)', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn((url: string) =>
        url.startsWith('/api/gtfs/lines') ? jsonResponse({ ...LINES, schedule: { ...LINES.schedule, state: 'loading' }, lines: null }) : jsonResponse({ cities: [] })
      )
      vi.stubGlobal('fetch', fetchMock)
      render(<CityLinesPage />)
      const linesCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/lines')).length
      await vi.advanceTimersByTimeAsync(34_000) // cała drabinka 1+2+3+5+8+15 s = 7 zapytań
      expect(linesCalls()).toBe(7)
      await vi.advanceTimersByTimeAsync(30_000) // po drabince ponawia dalej co 15 s
      expect(linesCalls()).toBe(9)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries after a failed fetch instead of staying failed', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/gtfs/lines')) return ++calls === 1 ? Promise.reject(new Error('x')) : jsonResponse(LINES)
          return jsonResponse({ cities: [] })
        })
      )
      render(<CityLinesPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(screen.getByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an error state when the lines fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/lines') ? Promise.reject(new Error('x')) : jsonResponse({ cities: [] }))))
    render(<CityLinesPage />)
    expect(await screen.findByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
  })
})
