// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LineDetailPage from './page'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { MODE_COLOR } from '@/components/map/mapData'

// Prawdziwy MapLibre nie działa w jsdom (WebGL) -- stub sprawdza tylko, co strona mu przekazuje.
vi.mock('@/components/MapView', () => ({
  MapView: ({
    pins,
    movers,
    route,
    ariaLabel,
  }: {
    pins: unknown[]
    movers?: { label: string; lat: number; lon: number; mode: string; bearing?: number | null }[]
    route?: { points: unknown[]; mode: string }
    ariaLabel: string
  }) => (
    <div data-testid="map" aria-label={ariaLabel} data-route-mode={route?.mode}>
      {pins.length} pins, {route?.points.length ?? 0} route points
      {(movers ?? []).map((m) => (
        <span key={m.label} data-testid="mover" data-lat={m.lat} data-lon={m.lon} data-mode={m.mode} data-bearing={m.bearing ?? ''}>
          {m.label}
        </span>
      ))}
    </div>
  ),
}))

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const params = { city: 'warszawa', routeId: '20' }
vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => ({ push }),
  notFound: () => notFound(),
}))

const LINE = {
  city: 'warszawa',
  schedule: { state: 'ready', loadedAt: '2026-09-03T09:15:00.000Z', ageMs: 1000, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'v1' },
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
          { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: 'Marszałkowska', wheelchair: 1, lat: 52, lon: 21, offsetSec: 0, onRequest: false },
          { stopId: '700201', groupId: '7002', name: 'Rondo ONZ', code: '02', street: 'Prosta', wheelchair: 0, lat: 52.02, lon: 21.02, offsetSec: 300, onRequest: true },
          { stopId: '500801', groupId: '5008', name: 'Metro Politechnika', code: '14', street: 'Waryńskiego', wheelchair: 0, lat: 52.04, lon: 21.02, offsetSec: 600, onRequest: false },
        ],
        departures: [
          { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200], frequencyBased: false },
          { category: 'saturday', times: [8 * 3600], frequencyBased: false },
        ],
        shape: null,
      },
      {
        directionId: 1,
        headsign: 'Centrum',
        origin: 'Dworzec Centralny',
        stops: [{ stopId: '500801', groupId: '5008', name: 'Dworzec Centralny', code: null, street: null, wheelchair: 0, lat: 52.1, lon: 21.1, offsetSec: 0, onRequest: false }],
        departures: [{ category: 'weekday', times: [6 * 3600 + 600], frequencyBased: false }],
        shape: null,
      },
    ],
  },
  alerts: [],
  attribution: ['ZTM'],
}

function stubFetch(lineBody: unknown = LINE) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/gtfs/line')) return jsonResponse(lineBody)
      if (url.startsWith('/api/gtfs/vehicles'))
        return jsonResponse({
          vehicles: [
            {
              sideNumber: '3801',
              tripId: 't',
              routeId: '20',
              directionId: 0,
              afterStopOrder: 0,
              fraction: 0.5,
              lat: 52.015,
              lon: 21.012,
              ageSec: 10,
              headsign: 'x',
              bearing: 135,
            },
          ],
          feed: { state: 'ready', ageMs: 5000 },
        })
      if (url.startsWith('/api/weather')) return jsonResponse({ available: false, reason: 'no-location' })
      return jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [{ id: '33605', name: 'Warszawa Centralna' }] }] })
    })
  )
}

beforeEach(() => {
  resetCitiesCacheForTests()
  push.mockClear()
  params.city = 'warszawa'
  params.routeId = '20'
})
afterEach(() => vi.unstubAllGlobals())

describe('LineDetailPage', () => {
  it('draws the route map from the stops, with vehicles at their raw feed position', async () => {
    stubFetch()
    render(<LineDetailPage />)
    const map = await screen.findByTestId('map')
    expect(map).toHaveAccessibleName('Mapa trasy linii 20')
    expect(map).toHaveTextContent('3 pins, 3 route points')
    const mover = await screen.findByTestId('mover')
    expect(mover).toHaveTextContent('#3801 · za „Centrum”')
    // Pozycja pojazdu na mapie to surowe lat/lon z feedu (nie interpolacja po przystankach).
    expect(Number(mover.getAttribute('data-lat'))).toBeCloseTo(52.015)
    expect(Number(mover.getAttribute('data-lon'))).toBeCloseTo(21.012)
  })

  it('draws route and vehicles in the mode colour convention: mode + bearing go to the map, the timeline vehicle is a mode-coloured dot with a downward arrow', async () => {
    stubFetch()
    render(<LineDetailPage />)
    const map = await screen.findByTestId('map')
    expect(map).toHaveAttribute('data-route-mode', 'tram')
    const mover = await screen.findByTestId('mover')
    expect(mover).toHaveAttribute('data-mode', 'tram')
    expect(mover).toHaveAttribute('data-bearing', '135')

    const onTimeline = await screen.findByTestId('timeline-vehicle')
    const probe = document.createElement('div')
    probe.style.backgroundColor = MODE_COLOR.tram
    expect(onTimeline.style.backgroundColor).toBe(probe.style.backgroundColor)
    expect(onTimeline).not.toHaveTextContent('▲')
    // eslint-disable-next-line testing-library/no-node-access -- ikona dekoracyjna (aria-hidden), bez roli do zapytania
    expect(onTimeline.querySelector('svg')).not.toBeNull()
  })

  it('draws the shape polyline instead of the stop-to-stop chord when the direction has one', async () => {
    const shape: [number, number][] = [
      [52, 21],
      [52.01, 21.005],
      [52.02, 21.02],
      [52.03, 21.015],
      [52.04, 21.02],
    ]
    stubFetch({
      ...LINE,
      line: { ...LINE.line, directions: [{ ...LINE.line.directions[0], shape }, LINE.line.directions[1]] },
    })
    render(<LineDetailPage />)
    const map = await screen.findByTestId('map')
    // 3 przystanki, ale 5 punktów kształtu — mapa ma rysować kształt, nie łamaną po przystankach.
    expect(map).toHaveTextContent('3 pins, 5 route points')
  })

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
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    // pełna trasa widoczna od razu (bez rozwijania), z linkiem do tablicy przystanku
    expect(screen.getByRole('link', { name: /pełna tablica słupka/ })).toHaveAttribute(
      'href',
      '/city/warszawa/stop/100101?name=Centrum'
    )
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('shows the right-side panel with a line info card, weather, and the "Aktualizacja" timestamp', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('heading', { name: 'Linia 20' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pogoda dziś — Warszawa' })).toBeInTheDocument()
    expect(screen.getByText(/Rozkład jazdy linii 20/)).toBeInTheDocument()
    expect(screen.getByText(/Aktualizacja:/)).toBeInTheDocument()
  })

  it('lists live vehicles in service in the aside, without a delay', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(await screen.findByRole('heading', { name: /Pojazdy w trasie/ })).toBeInTheDocument()
    expect(await screen.findByText('#3801')).toBeInTheDocument()
  })

  it('switches direction with the toggle', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('heading', { name: /Trasa linii/ })).toBeInTheDocument()
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
    // Rondo ONZ (+300 s) pokazuje 06:05 na trasie
    expect(screen.getByText('06:05')).toBeInTheDocument()
  })

  it('renders stop-type glyphs, request badge and street names on the route', async () => {
    stubFetch() // LINE fixture already has a request stop + streets after this task's edit
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    // request stop badge
    expect(screen.getByText('NŻ')).toBeInTheDocument()
    // street name shown somewhere on the route
    expect(screen.getByText('Marszałkowska')).toBeInTheDocument()
    // mini-legend
    expect(screen.getByText(/na żądanie/i)).toBeInTheDocument()
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

  it('keeps the weather card in the right column even before the line loads', async () => {
    stubFetch({ ...LINE, line: null, schedule: { ...LINE.schedule, state: 'loading' } })
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Pogoda dziś — Warszawa' })).toBeInTheDocument()
    // Karta „Linia X" zależy od danych linii — jej brak podczas ładowania jest w porządku.
    expect(screen.queryByRole('heading', { name: /^Linia / })).not.toBeInTheDocument()
  })

  it('shows an error state when the line fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/line') ? Promise.reject(new Error('x')) : jsonResponse({ cities: [] }))))
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
  })

  it('keeps retrying past the first ladder while the schedule is still loading (never gives up)', async () => {
    vi.useFakeTimers()
    try {
      const loadingBody = { ...LINE, line: null, schedule: { ...LINE.schedule, state: 'loading' } }
      const fetchMock = vi.fn((url: string) =>
        url.startsWith('/api/gtfs/line?') ? jsonResponse(loadingBody) : url.startsWith('/api/gtfs/vehicles') ? jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } }) : jsonResponse({ cities: [] })
      )
      vi.stubGlobal('fetch', fetchMock)
      render(<LineDetailPage />)
      const lineCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/line?')).length
      await vi.advanceTimersByTimeAsync(34_000) // cała drabinka 1+2+3+5+8+15 s = 7 zapytań
      expect(lineCalls()).toBe(7)
      await vi.advanceTimersByTimeAsync(30_000) // po drabince ponawia dalej co 15 s
      expect(lineCalls()).toBe(9)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetches while alerts are unknown (null) and then shows the banner', async () => {
    vi.useFakeTimers()
    try {
      const alert = { id: 'a', routes: ['20'], effect: 'DETOUR', link: 'https://www.wtp.waw.pl/x/', title: 'Utrudnienia na linii 20', body: 'Treść.' }
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/gtfs/line?')) return jsonResponse({ ...LINE, alerts: ++calls === 1 ? null : [alert] })
          if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } })
          return jsonResponse({ cities: [] })
        })
      )
      render(<LineDetailPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
      expect(screen.queryByText('Utrudnienia na linii 20')).not.toBeInTheDocument() // nieznane != brak, ale i baner się nie pokazuje
      await act(() => vi.advanceTimersByTimeAsync(1_000)) // pierwszy stopień drabinki
      expect(calls).toBe(2)
      expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
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
          if (url.startsWith('/api/gtfs/line?')) return ++calls === 1 ? Promise.reject(new Error('x')) : jsonResponse(LINE)
          if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } })
          return jsonResponse({ cities: [] })
        })
      )
      render(<LineDetailPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(screen.getByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an alert banner when the line has an active disruption', async () => {
    stubFetch({
      ...LINE,
      alerts: [{ id: 'a', routes: ['20'], effect: 'DETOUR', link: 'https://www.wtp.waw.pl/x/', title: 'Utrudnienia na linii 20', body: 'Treść.' }],
    })
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
    expect(screen.getByText('Treść.')).toBeInTheDocument()
  })
})
