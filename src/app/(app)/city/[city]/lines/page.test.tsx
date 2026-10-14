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
let searchSeed = ''
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchSeed),
  notFound: () => notFound(),
}))

// Karty prawej kolumny mają własne testy i własne zapytania — tu sprawdzamy tylko, że strona je montuje.
vi.mock('@/components/WeatherChip', () => ({
  WeatherChip: ({ city }: { city: string }) => <div data-testid="weather-chip">{city}</div>,
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

// Wszystkie cztery tryby (kolej miejska niepusta) + „20 Lipca" w nazwie trasy do testu rankingu.
const FULL = {
  ...LINES,
  lines: {
    ...LINES.lines,
    bus: [...LINES.lines.bus, line('200', 'bus', 'Dworzec – Bemowo'), line('127', 'bus', 'Dworzec Centralny – 20 Lipca')],
    rail: [line('S1', 'rail', 'Pruszków – Otwock')],
  },
}

const SEARCH_LABEL = 'Numer linii lub przystanek końcowy'

const linesCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/lines')).length

function stubFetch(linesBody: unknown = LINES) {
  const fetchMock = vi.fn((url: string) =>
    url.startsWith('/api/gtfs/lines')
      ? jsonResponse(linesBody)
      : jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  resetCitiesCacheForTests()
  push.mockClear()
  cityParam = 'warszawa'
  searchSeed = ''
  window.history.replaceState(null, '', '/city/warszawa/lines')
  window.localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('CityLinesPage', () => {
  it('calls notFound for a malformed city id', () => {
    cityParam = 'a/b'
    expect(() => render(<CityLinesPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('has the "Linie" heading with the city as subtitle and lists lines grouped by mode, each linking to its line page', async () => {
    stubFetch()
    render(<CityLinesPage />)
    const link = await screen.findByRole('link', { name: 'Linia M1: Kabaty – Młociny' })
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
    expect(screen.getByRole('heading', { level: 1, name: 'Linie' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveAttribute('maxlength', '100')
    expect(screen.getAllByTestId('line-section')).toHaveLength(3)
  })

  it('mounts the weather chip in the top bar and the transit widget in the aside', async () => {
    stubFetch()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(screen.getByTestId('weather-chip')).toHaveTextContent('warszawa')
    expect(screen.getByTestId('transit-widget')).toHaveTextContent('warszawa/Warszawa')
  })

  describe('three distinct states', () => {
    it('loading skeleton: a busy section skeleton with "Wczytywanie…" while the first fetch is pending, no error and no empty-feed text', async () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
      render(<CityLinesPage />)
      expect(screen.getByTestId('lines-skeleton')).toHaveAttribute('aria-busy', 'true')
      expect(screen.getByText('Wczytywanie…')).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
      expect(screen.queryByText('Brak linii w rozkładzie.')).not.toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })

    it('loading: the schedule is still warming up (lines null) — skeleton plus the schedule phase', async () => {
      stubFetch({ ...LINES, schedule: { ...LINES.schedule, state: 'loading', phase: 'stop_times', loadedAt: null, ageMs: null }, lines: null })
      render(<CityLinesPage />)
      expect(await screen.findByText('Wczytywanie…')).toBeInTheDocument()
      expect(screen.getByTestId('lines-skeleton')).toBeInTheDocument()
      expect(screen.getByText(/Wczytywanie rozkładu — Warszawa/)).toBeInTheDocument()
      expect(screen.queryByText('Brak linii w rozkładzie.')).not.toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
    })

    it('failed without lines: says it could not fetch (not that the feed is empty) and offers a retry that refetches', async () => {
      let calls = 0
      const fetchMock = vi.fn((url: string) => {
        if (!url.startsWith('/api/gtfs/lines')) return jsonResponse({ cities: [] })
        return ++calls <= 1 ? Promise.reject(new Error('x')) : jsonResponse(LINES)
      })
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      expect(await screen.findByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
      expect(screen.queryByText('Wczytywanie…')).not.toBeInTheDocument()
      expect(screen.queryByText('Brak linii w rozkładzie.')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
      expect(await screen.findByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
    })

    it('failed with lines keeps the list and warns on top (never pretends to be fresh)', async () => {
      stubFetch({ ...LINES, schedule: { ...READY, state: 'failed', ageMs: 2 * 60 * 60 * 1000 } })
      render(<CityLinesPage />)
      expect(await screen.findByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
      expect(screen.getByText(/odświeżanie nie powiodło się/)).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
    })

    it('ready [] says „Brak linii w rozkładzie." (not an error, not loading)', async () => {
      stubFetch(EMPTY_LINES)
      render(<CityLinesPage />)
      expect(await screen.findByText('Brak linii w rozkładzie.')).toBeInTheDocument()
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
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), 'n16')
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
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), 'mlociny')
      expect(screen.getByRole('link', { name: /Linia M1/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Linia 20/ })).not.toBeInTheDocument()
    })

    it('ranks exact number before prefix and name', async () => {
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), '20')
      expect(screen.getAllByRole('link', { name: /^Linia / }).map((l) => l.getAttribute('href'))).toEqual([
        '/city/warszawa/line/20', // numer równy
        '/city/warszawa/line/200', // prefiks numeru
        '/city/warszawa/line/127', // fraza w nazwie trasy („20 Lipca")
      ])
    })

    it('no match shows „Brak pasujących linii" + clear filters, which clears q and mode', async () => {
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.click(screen.getByRole('button', { name: 'Tramwaje' }))
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), 'zzzz')
      expect(screen.getByText('Brak pasujących linii')).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać listy linii.')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
      expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByTestId('line-section')).toHaveLength(4)
      expect(window.location.search).toBe('')
    })

    it('the clear button empties the field and returns to the sections', async () => {
      stubFetch()
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.queryByRole('button', { name: 'Wyczyść wyszukiwanie' })).not.toBeInTheDocument()
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), 'zzzz')
      expect(screen.getByText('Brak pasujących linii')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Wyczyść wyszukiwanie' }))
      expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('')
      expect(screen.getAllByTestId('line-section')).toHaveLength(3)
    })
  })

  describe('mode filter', () => {
    it('mode chip filters sections (all four modes)', async () => {
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      const group = screen.getByRole('group', { name: 'Rodzaj komunikacji' })
      expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Wszystkie', 'Metro', 'Tramwaje', 'Autobusy', 'Kolej miejska'])
      for (const [label, route] of [
        ['Metro', 'M1'],
        ['Tramwaje', '20'],
        ['Autobusy', '128'],
        ['Kolej miejska', 'S1'],
      ]) {
        await user.click(within(group).getByRole('button', { name: label }))
        expect(screen.getAllByTestId('line-section')).toHaveLength(1)
        expect(screen.getByRole('link', { name: new RegExp(`^Linia ${route}:`) })).toBeInTheDocument()
        // aktywny tryb = sekcja rozwinięta bez klikania (na telefonie domyślnie byłaby zwinięta)
        expect(screen.getByTestId('line-section')).toHaveAttribute('open')
      }
    })

    it('chip has aria-pressed and „Wszystkie" resets', async () => {
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      await user.click(screen.getByRole('button', { name: 'Metro' }))
      expect(screen.getByRole('button', { name: 'Metro' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'false')
      await user.click(screen.getByRole('button', { name: 'Wszystkie' }))
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByTestId('line-section')).toHaveLength(4)
    })

    it('a mode composes with q (results stay inside the mode)', async () => {
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.click(screen.getByRole('button', { name: 'Tramwaje' }))
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), '2')
      expect(screen.getAllByRole('link', { name: /^Linia / }).map((l) => l.getAttribute('href'))).toEqual(['/city/warszawa/line/20'])
    })

    it('a stored collapse of the only section still wins over the active mode', async () => {
      window.localStorage.setItem('monitor.linesSections.v1', JSON.stringify({ metro: false }))
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.click(screen.getByRole('button', { name: 'Metro' }))
      await waitFor(() => expect(screen.getByTestId('line-section')).not.toHaveAttribute('open'))
    })
  })

  describe('URL state', () => {
    it('q and mode are written to the URL and preserved params', async () => {
      window.history.replaceState(null, '', '/city/warszawa/lines?foo=1')
      stubFetch(FULL)
      const user = userEvent.setup()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.click(screen.getByRole('button', { name: 'Tramwaje' }))
      expect(new URLSearchParams(window.location.search).get('mode')).toBe('tram')
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), '20')
      const params = new URLSearchParams(window.location.search)
      expect(params.get('q')).toBe('20')
      expect(params.get('mode')).toBe('tram')
      expect(params.get('foo')).toBe('1')
      await user.click(screen.getByRole('button', { name: 'Wyczyść wyszukiwanie' }))
      await user.click(screen.getByRole('button', { name: 'Wszystkie' }))
      expect(window.location.search).toBe('?foo=1')
    })

    it('initial q/mode from URL', async () => {
      searchSeed = 'q=20&mode=tram'
      stubFetch(FULL)
      render(<CityLinesPage />)
      await screen.findByRole('heading', { level: 2, name: 'Wyniki · 1' })
      expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('20')
      expect(screen.getByRole('button', { name: 'Tramwaje' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('link', { name: /^Linia 20:/ })).toBeInTheDocument()
    })

    it('invalid mode in URL ignored', async () => {
      searchSeed = 'mode=submarine&q=' + 'x'.repeat(150)
      stubFetch(FULL)
      render(<CityLinesPage />)
      await screen.findByRole('searchbox', { name: SEARCH_LABEL })
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('x'.repeat(100))
    })

    it('mode not in city ignored after load', async () => {
      searchSeed = 'mode=rail'
      stubFetch(LINES) // brak kolei miejskiej w tym mieście
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.queryByRole('button', { name: 'Kolej miejska' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByTestId('line-section')).toHaveLength(3)
    })

    it('city change resets q, mode and results (key)', async () => {
      const KRAKOW = { ...LINES, city: 'krakow', lines: { ...EMPTY_LINES.lines, tram: [line('50', 'tram', 'Bronowice – Czerwone Maki')] } }
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/gtfs/lines?city=krakow')) return jsonResponse(KRAKOW)
          if (url.startsWith('/api/gtfs/lines')) return jsonResponse(FULL)
          return jsonResponse({ cities: [] })
        })
      )
      const user = userEvent.setup()
      const { rerender } = render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      await user.click(screen.getByRole('button', { name: 'Tramwaje' }))
      await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), '20')
      expect(screen.getByRole('link', { name: /^Linia 20:/ })).toBeInTheDocument()
      cityParam = 'krakow'
      searchSeed = '' // nawigacja do innego miasta nie niesie q/mode
      rerender(<CityLinesPage />)
      expect(await screen.findByRole('link', { name: /^Linia 50:/ })).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: SEARCH_LABEL })).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Wszystkie' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('link', { name: /^Linia 20:/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Linia M1/ })).not.toBeInTheDocument()
    })
  })

  it('no per-row requests (fetch called once for lines)', async () => {
    const fetchMock = stubFetch(FULL)
    const user = userEvent.setup()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    await user.click(screen.getByRole('button', { name: 'Autobusy' }))
    await user.type(screen.getByRole('searchbox', { name: SEARCH_LABEL }), '1')
    expect(linesCalls(fetchMock)).toBe(1)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/line')).length).toBe(1) // ani /api/gtfs/line?route=…
  })

  describe('recent lines', () => {
    it('is hidden when nothing was viewed', async () => {
      stubFetch()
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.queryByText('Ostatnio oglądane')).not.toBeInTheDocument()
    })

    it('recents by known routeId: shows stored lines of this city and skips unknown ids', async () => {
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

    it('a schedule a few hours old is normal: no warning on top, the plain footer line stays', async () => {
      stubFetch({ ...LINES, schedule: { ...READY, ageMs: (3 * 60 + 44) * 60 * 1000 } })
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.queryByText(/dane sprzed/)).not.toBeInTheDocument()
      expect(screen.getAllByText(/Rozkład jazdy — Warszawa/)).toHaveLength(1)
      expect(within(screen.getByTestId('lines-footer')).getByText(/Rozkład jazdy — Warszawa/)).toBeInTheDocument()
    })

    it('a day-old schedule warns on top and the status block is NOT repeated in the footer', async () => {
      stubFetch({ ...LINES, schedule: { ...READY, ageMs: 26 * 60 * 60 * 1000 } })
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.getAllByText(/dane sprzed 26 h/)).toHaveLength(1)
      expect(screen.getAllByText(/Rozkład jazdy — Warszawa/)).toHaveLength(1)
      expect(screen.getAllByText(/Aktualizacja: /)).toHaveLength(1)
      const footer = screen.getByTestId('lines-footer')
      expect(within(footer).queryByText(/Rozkład jazdy — Warszawa/)).not.toBeInTheDocument()
      expect(within(footer).getByText(/Dane rozkładowe: ZTM/)).toBeInTheDocument()
    })

    it('a failed refresh warns on top once, footer keeps only the attribution', async () => {
      stubFetch({ ...LINES, schedule: { ...READY, state: 'failed', ageMs: 2 * 60 * 60 * 1000 } })
      render(<CityLinesPage />)
      await screen.findByRole('link', { name: /Linia M1/ })
      expect(screen.getAllByText(/odświeżanie nie powiodło się/)).toHaveLength(1)
      expect(screen.getAllByText(/Rozkład jazdy — Warszawa/)).toHaveLength(1)
      expect(within(screen.getByTestId('lines-footer')).queryByText(/Rozkład jazdy/)).not.toBeInTheDocument()
    })
  })

  it('hides the city picker while only one city exists', async () => {
    stubFetch()
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(screen.queryByRole('combobox', { name: /miasto/i })).not.toBeInTheDocument()
  })

  it('renders the city picker in the top bar once there is more than one city (line-browser navigation target)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/gtfs/lines')
          ? jsonResponse(LINES)
          : jsonResponse({
              cities: [
                { id: 'warszawa', name: 'Warszawa', railStations: [] },
                { id: 'krakow', name: 'Kraków', railStations: [] },
              ],
            })
      )
    )
    render(<CityLinesPage />)
    await screen.findByRole('link', { name: /Linia M1/ })
    expect(await screen.findByRole('combobox', { name: /miasto/i })).toBeInTheDocument()
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
      // brak listy + rozkład `failed` = stan „nie udało się" (z ponowieniem), nie „pusty feed"
      expect(screen.getByText('Nie udało się pobrać listy linii.')).toBeInTheDocument()
      expect(screen.queryByText('Brak linii w rozkładzie.')).not.toBeInTheDocument()
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
