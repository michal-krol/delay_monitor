// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

// Karty prawej kolumny mają własne testy i własne zapytania — tu sprawdzamy tylko, że strona je montuje.
vi.mock('@/components/CityWeatherCard', () => ({
  CityWeatherCard: ({ city }: { city: string }) => <div data-testid="weather-card">{city}</div>,
}))
vi.mock('@/components/CityTransitWidget', () => ({
  CityTransitWidget: ({ city, cityName }: { city: string; cityName: string }) => (
    <div data-testid="transit-widget">
      {city}/{cityName}
    </div>
  ),
}))

const READY = { state: 'ready', loadedAt: '2026-09-30T05:12:00.000Z', ageMs: 1000, phase: null, serviceDates: ['2026-09-30'], feedVersion: 'v1' }

const line = (routeId: string, mode: string, longName: string, kind = 'regular') => ({
  routeId,
  line: routeId,
  longName,
  mode,
  kind,
})

const LINES = {
  city: 'warszawa',
  schedule: READY,
  lines: {
    metro: [line('M1', 'metro', 'Kabaty – Młociny')],
    tram: [line('20', 'tram', 'Piaski')],
    bus: [line('128', 'bus', 'Chomiczówka – Dworzec'), line('N16', 'bus', 'Dworzec Centralny – Bemowo', 'night')],
    rail: [],
    other: [],
  },
  attribution: ['ZTM'],
}

const EMPTY_LINES = { ...LINES, lines: { metro: [], tram: [], bus: [], rail: [], other: [] } }

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
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('CityLinesPage', () => {
  it('calls notFound for a malformed city id', () => {
    cityParam = 'a/b'
    expect(() => render(<CityLinesPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('has the "Linie — Miasto" heading and lists lines grouped by mode, each linking to its line page', async () => {
    stubFetch()
    render(<CityLinesPage />)
    const link = await screen.findByRole('link', { name: 'Linia M1: Kabaty – Młociny' })
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
    expect(screen.getByRole('heading', { level: 1, name: 'Linie — Warszawa' })).toBeInTheDocument()
    expect(screen.getByText('Metro, tramwaje, autobusy i kolej miejska')).toBeInTheDocument()
    expect(screen.getAllByTestId('line-section')).toHaveLength(3)
  })

  it('mounts the weather card and the transit widget in the aside', async () => {
    stubFetch()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(screen.getByTestId('weather-card')).toHaveTextContent('warszawa')
    expect(screen.getByTestId('transit-widget')).toHaveTextContent('warszawa/Warszawa')
  })

  describe('three distinct states', () => {
    it('loading: "Wczytywanie…" while the first fetch is pending, no error and no empty-feed text', async () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
      render(<CityLinesPage />)
      expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
      expect(screen.queryByText('Feed nie zawiera linii.')).not.toBeInTheDocument()
    })

    it('loading: the schedule is still warming up (lines null) — "Wczytywanie…" plus the schedule phase', async () => {
      stubFetch({ ...LINES, schedule: { ...LINES.schedule, state: 'loading', phase: 'stop_times', loadedAt: null, ageMs: null }, lines: null })
      render(<CityLinesPage />)
      expect(await screen.findByText('Wczytywanie…')).toBeInTheDocument()
      expect(screen.getByText(/Wczytywanie rozkładu — Warszawa/)).toBeInTheDocument()
      expect(screen.queryByText('Feed nie zawiera linii.')).not.toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
    })

    it('error: a failed fetch without data says it could not fetch, not that the feed is empty', async () => {
      vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/lines') ? Promise.reject(new Error('x')) : jsonResponse({ cities: [] }))))
      render(<CityLinesPage />)
      expect(await screen.findByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
      expect(screen.queryByText('Wczytywanie…')).not.toBeInTheDocument()
      expect(screen.queryByText('Feed nie zawiera linii.')).not.toBeInTheDocument()
    })

    it('empty: a loaded feed with no lines says so (not an error, not loading)', async () => {
      stubFetch(EMPTY_LINES)
      render(<CityLinesPage />)
      expect(await screen.findByText('Feed nie zawiera linii.')).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
      expect(screen.queryByText('Wczytywanie…')).not.toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })
  })

  describe('search', () => {
    it('replaces the sections with a result list across all modes, with a kind chip', async () => {
      stubFetch()
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.type(screen.getByRole('searchbox', { name: /szukaj linii/i }), 'n16')
      expect(screen.queryAllByTestId('line-section')).toHaveLength(0)
      expect(screen.getByRole('heading', { level: 2, name: 'Wyniki · 1' })).toBeInTheDocument()
      const hit = screen.getByRole('link', { name: /^Linia N16: / })
      expect(hit).toHaveAttribute('href', '/city/warszawa/line/N16')
      expect(hit).toHaveTextContent('nocna')
    })

    it('matches an end stop ignoring case and diacritics', async () => {
      stubFetch()
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.type(screen.getByRole('searchbox', { name: /szukaj linii/i }), 'mlociny')
      expect(screen.getByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Linia 20/ })).not.toBeInTheDocument()
    })

    it('says so when nothing matches, and returns to the sections when cleared', async () => {
      stubFetch()
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      const box = screen.getByRole('searchbox', { name: /szukaj linii/i })
      await user.type(box, 'zzzz')
      expect(screen.getByText('Brak linii pasujących do wyszukiwania.')).toBeInTheDocument()
      await user.clear(box)
      expect(screen.getAllByTestId('line-section')).toHaveLength(3)
    })
  })

  describe('recent lines', () => {
    it('is hidden when nothing was viewed', async () => {
      stubFetch()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.queryByText('Ostatnio oglądane')).not.toBeInTheDocument()
    })

    it('shows stored lines of this city and skips unknown ids', async () => {
      window.localStorage.setItem('monitor.recentLines.v1', JSON.stringify({ warszawa: ['N16', 'GONE', 'M1'], krakow: ['20'] }))
      stubFetch()
      render(<CityLinesPage />)
      const strip = await screen.findByRole('group', { name: 'Ostatnio oglądane' })
      await waitFor(() =>
        expect(within(strip).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
          '/city/warszawa/line/N16',
          '/city/warszawa/line/M1',
        ])
      )
    })
  })

  describe('sections', () => {
    it('toggling a section stores its state under the mode key', async () => {
      stubFetch()
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      const metro = screen.getAllByTestId('line-section')[0] as HTMLDetailsElement
      expect(metro.open).toBe(true)
      await user.click(within(metro).getByText('Metro'))
      await waitFor(() => expect(metro.open).toBe(false))
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem('monitor.linesSections.v1') ?? '{}')).toEqual({ metro: false }))
    })

    it('does not persist defaults just from rendering', async () => {
      stubFetch()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(window.localStorage.getItem('monitor.linesSections.v1')).toBeNull()
    })

    it('a stored state wins over the default', async () => {
      window.localStorage.setItem('monitor.linesSections.v1', JSON.stringify({ tram: false, 'bus:night': false }))
      stubFetch()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await waitFor(() => expect(screen.getAllByTestId('line-section')[1]).not.toHaveAttribute('open'))
      expect(screen.getAllByTestId('line-section')[0]).toHaveAttribute('open')
    })
  })

  describe('schedule status', () => {
    it('a healthy schedule: the normal "Rozkład jazdy — Miasto · Aktualizacja" line is the footer, none on top', async () => {
      stubFetch()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.getAllByText(/Rozkład jazdy — Warszawa/)).toHaveLength(1)
      const footer = screen.getByTestId('lines-footer')
      expect(within(footer).getByText(/Rozkład jazdy — Warszawa/)).toBeInTheDocument()
      expect(within(footer).getByText(/Aktualizacja: /)).toBeInTheDocument()
      expect(within(footer).getByText(/Dane rozkładowe: ZTM/)).toBeInTheDocument()
    })

    it('a stale schedule adds a warning on top, the footer stays calm', async () => {
      stubFetch({ ...LINES, schedule: { ...READY, ageMs: 3 * 60 * 60 * 1000 } })
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.getAllByText(/dane sprzed 3 h/)).toHaveLength(1)
      expect(within(screen.getByTestId('lines-footer')).queryByText(/dane sprzed/)).not.toBeInTheDocument()
    })
  })

  it('renders the city picker in the top bar (line-browser navigation target)', async () => {
    stubFetch()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(screen.getByRole('combobox', { name: /miasto/i })).toBeInTheDocument()
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

  it('keeps polling when the first schedule load failed on the server (state failed, lines null) and renders once lines exist', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/gtfs/lines')) {
            return ++calls === 1 ? jsonResponse({ ...LINES, schedule: { ...READY, state: 'failed', loadedAt: null }, lines: null }) : jsonResponse(LINES)
          }
          return jsonResponse({ cities: [] })
        })
      )
      render(<CityLinesPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(1_000)) // pierwszy stopień drabinki
      expect(screen.getByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
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
})
