// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LineDetailPage from './page'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { stubMatchMedia } from '@/test-utils/media'
import { MODE_COLOR } from '@/components/map/mapData'
import { ICON_SIZE } from '@/components/icons'
import { LINE_PALETTE, MODE_ICON, MODE_LABEL } from '@/components/transitMode'
import { ON_REQUEST_TITLE } from '@/components/OnRequestBadge'

// Prawdziwy MapLibre nie działa w jsdom (WebGL) -- stub sprawdza tylko, co strona mu przekazuje.
const pinClickHandlers: unknown[] = []
vi.mock('@/components/MapView', () => ({
  MapView: ({
    pins,
    movers,
    route,
    ariaLabel,
    compact,
    onPinClick,
  }: {
    pins: unknown[]
    movers?: { label: string; lat: number; lon: number; mode: string; bearing?: number | null }[]
    route?: { points: unknown[]; mode: string }
    ariaLabel: string
    compact?: boolean
    onPinClick?: (id: string) => void
  }) => {
    pinClickHandlers.push(onPinClick)
    return (
      <div data-testid="map" aria-label={ariaLabel} data-route-mode={route?.mode} data-compact={compact === true ? 'yes' : 'no'}>
        {pins.length} pins, {route?.points.length ?? 0} route points
        <button type="button" data-testid="map-pin-1" onClick={() => onPinClick?.('1')}>
          pin 1
        </button>
        {(movers ?? []).map((m) => (
          <span key={m.label} data-testid="mover" data-lat={m.lat} data-lon={m.lon} data-mode={m.mode} data-bearing={m.bearing ?? ''}>
            {m.label}
          </span>
        ))}
      </div>
    )
  },
}))

const themeState = vi.hoisted(() => ({ resolvedTheme: 'light' }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: themeState.resolvedTheme, theme: 'system', setTheme: () => {} }) }))

const push = vi.fn()
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const params = { city: 'warszawa', routeId: '20' }
vi.mock('next/navigation', () => ({
  useParams: () => params,
  useRouter: () => ({ push }),
  usePathname: () => '/city/warszawa/line/20',
  // Widok linii żyje w URL-u (`replaceState`) — mock czyta aktualne `location.search`.
  useSearchParams: () => new URLSearchParams(window.location.search),
  notFound: () => notFound(),
}))

type Stop = {
  stopId: string
  groupId: string
  name: string
  code: string | null
  street: string | null
  wheelchair: number
  lat: number
  lon: number
  offsetSec: number
  onRequest: boolean
}

const DIR0_STOPS: Stop[] = [
  { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: 'Marszałkowska', wheelchair: 1, lat: 52, lon: 21, offsetSec: 0, onRequest: false },
  { stopId: '700201', groupId: '7002', name: 'Rondo ONZ', code: '02', street: 'Prosta', wheelchair: 0, lat: 52.02, lon: 21.02, offsetSec: 300, onRequest: true },
  { stopId: '500801', groupId: '5008', name: 'Metro Politechnika', code: '14', street: 'Waryńskiego', wheelchair: 0, lat: 52.04, lon: 21.02, offsetSec: 600, onRequest: false },
]
// Kierunek 1 jest krótszy (2 przystanki) i ma przystanek, którego nie ma w kierunku 0 — `?stop=` bez `dir` musi go znaleźć.
const DIR1_STOPS: Stop[] = [
  { stopId: '900901', groupId: '9009', name: 'Dworzec Centralny', code: null, street: null, wheelchair: 0, lat: 52.1, lon: 21.1, offsetSec: 0, onRequest: false },
  { stopId: '100103', groupId: '1001', name: 'Centrum', code: '03', street: null, wheelchair: 0, lat: 52.12, lon: 21.12, offsetSec: 420, onRequest: false },
]

const DIR0 = {
  directionId: 0,
  headsign: 'Dworzec Centralny',
  origin: 'Centrum',
  stops: DIR0_STOPS,
  departures: [
    { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200], frequencyBased: false },
    { category: 'saturday', times: [8 * 3600], frequencyBased: false },
  ],
  shape: null,
}
const DIR1 = {
  directionId: 1,
  headsign: 'Centrum',
  origin: 'Dworzec Centralny',
  stops: DIR1_STOPS,
  departures: [{ category: 'weekday', times: [6 * 3600 + 600], frequencyBased: false }],
  shape: null,
}

const LINE = {
  city: 'warszawa',
  schedule: { state: 'ready', loadedAt: '2026-09-03T09:15:00.000Z', ageMs: 1000, phase: null, serviceDates: ['2026-09-01', '2026-09-02', '2026-09-03'], feedVersion: 'v1' },
  line: {
    routeId: '20',
    line: '20',
    longName: 'Piaski – Międzylesie',
    mode: 'tram',
    kind: 'regular',
    directions: [DIR0, DIR1],
  },
  alerts: [],
  attribution: ['ZTM'],
}

const lineWith = (directions: unknown[], extra: Record<string, unknown> = {}) => ({ ...LINE, line: { ...LINE.line, directions }, ...extra })

const ALERT = { id: 'a', routes: ['20'], effect: 'DETOUR', link: 'https://www.wtp.waw.pl/x/', title: 'Utrudnienia na linii 20', body: 'Treść.' }

const VEHICLES_READY = {
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
}

function stubFetch(lineBody: unknown = LINE, vehiclesBody: unknown = VEHICLES_READY) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/gtfs/line')) return jsonResponse(lineBody)
    if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse(vehiclesBody)
    if (url.startsWith('/api/weather')) return jsonResponse({ available: false, reason: 'no-location' })
    return jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [{ id: '33605', name: 'Warszawa Centralna' }] }] })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const callsTo = (fetchMock: ReturnType<typeof stubFetch>, prefix: string) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix))

const search = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  resetCitiesCacheForTests()
  push.mockClear()
  pinClickHandlers.length = 0
  themeState.resolvedTheme = 'light'
  params.city = 'warszawa'
  params.routeId = '20'
  window.history.replaceState(null, '', '/city/warszawa/line/20')
  window.localStorage.clear()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LineDetailPage', () => {
  it('draws the route map from the stops, with vehicles at their raw feed position', async () => {
    stubFetch()
    render(<LineDetailPage />)
    const map = await screen.findByTestId('map')
    expect(map).toHaveAccessibleName('Mapa trasy linii 20')
    expect(map).toHaveTextContent('3 pins, 3 route points')
    const mover = await screen.findByTestId('mover')
    expect(mover).toHaveTextContent('#3801 · za „Centrum 01”')
    // Pozycja pojazdu na mapie to surowe lat/lon z feedu (nie interpolacja po przystankach).
    expect(Number(mover.getAttribute('data-lat'))).toBeCloseTo(52.015)
    expect(Number(mover.getAttribute('data-lon'))).toBeCloseTo(21.012)
  })

  it('metro timeline dot gets the dark-red ring (yellow on a white ring vanishes on the light card); a tram dot keeps the default ring', async () => {
    stubFetch({ ...LINE, line: { ...LINE.line, mode: 'metro', kind: 'regular' } })
    const { unmount } = render(<LineDetailPage />)
    const metroDot = await screen.findByTestId('timeline-vehicle')
    expect(metroDot.style.getPropertyValue('--tw-ring-color')).toBe(LINE_PALETTE.metro.fg)
    unmount()

    stubFetch()
    render(<LineDetailPage />)
    const tramDot = await screen.findByTestId('timeline-vehicle')
    expect(tramDot.style.getPropertyValue('--tw-ring-color')).toBe('')
  })

  it('a night-bus timeline dot gets the light dark-mode ring (black vanishes on the dark card); a regular bus dot keeps the page-coloured one', async () => {
    stubFetch({ ...LINE, line: { ...LINE.line, mode: 'bus', kind: 'night' } })
    const { unmount } = render(<LineDetailPage />)
    const nightDot = await screen.findByTestId('timeline-vehicle')
    expect(nightDot).toHaveClass('dark:ring-white/40')
    expect(nightDot).not.toHaveClass('dark:ring-slate-900')
    unmount()

    stubFetch({ ...LINE, line: { ...LINE.line, mode: 'bus', kind: 'regular' } })
    render(<LineDetailPage />)
    const regularDot = await screen.findByTestId('timeline-vehicle')
    expect(regularDot).toHaveClass('dark:ring-slate-900')
    expect(regularDot).not.toHaveClass('dark:ring-white/40')
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
    // Marker jest czytelny dla technologii asystujących (rail nie siedzi pod aria-hidden).
    expect(onTimeline).toHaveTextContent('Pojazd 3801')
    expect(onTimeline).toBeVisible()
    // eslint-disable-next-line testing-library/no-node-access -- żaden przodek markera nie jest aria-hidden
    expect(onTimeline.closest('[aria-hidden="true"]')).toBeNull()
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
    stubFetch(lineWith([{ ...DIR0, shape }, DIR1]))
    render(<LineDetailPage />)
    const map = await screen.findByTestId('map')
    // 3 przystanki, ale 5 punktów kształtu — mapa ma rysować kształt, nie łamaną po przystankach.
    expect(map).toHaveTextContent('3 pins, 5 route points')
  })

  it('falls back to the stop-to-stop polyline when the shape is null', async () => {
    stubFetch(lineWith([{ ...DIR0, shape: null }, DIR1]))
    render(<LineDetailPage />)
    expect(await screen.findByTestId('map')).toHaveTextContent('3 pins, 3 route points')
  })

  it('offers the map preview only for a route with at least two stops', async () => {
    stubFetch(lineWith([{ ...DIR0, stops: DIR0_STOPS.slice(0, 1) }, DIR1]))
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mapa trasy' })).not.toBeInTheDocument()
  })

  it('shows the map preview below the stop list under a „Mapa trasy” heading', async () => {
    stubFetch()
    render(<LineDetailPage />)
    const list = await screen.findByRole('heading', { name: /Trasa linii/ })
    const mapHeading = await screen.findByRole('heading', { name: 'Mapa trasy' })
    expect(list.compareDocumentPosition(mapHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('calls notFound for a malformed route id', () => {
    params.routeId = 'a/b'
    expect(() => render(<LineDetailPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('shows the direction card: full headsign, origin, swap button — and a link to the stop board, never a delay', async () => {
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    expect(screen.getByText('Kierunek')).toBeInTheDocument()
    expect(screen.getByText('Dworzec Centralny', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Od: Centrum')).toBeInTheDocument()
    // Widoczny tekst jest nazwą przycisku (ikona dekoracyjna).
    expect(screen.getByRole('button', { name: 'Zmień kierunek' })).toBeInTheDocument()
    // kolumny rozkładu obok siebie — sobota nie pod dniami roboczymi
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    // pełna trasa widoczna od razu (bez rozwijania), z linkiem do tablicy wybranego przystanku
    expect(screen.getByRole('link', { name: 'Odjazdy z przystanku' })).toHaveAttribute('href', '/city/warszawa/stop/100101?name=Centrum')
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('shows the right-side panel with a line info card, weather, and the "Aktualizacja" timestamp', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('heading', { name: 'Linia 20' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Pogoda:/ })).toBeInTheDocument()
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
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    // request stop badge — the same marker as on the departure board and the map panel
    expect(screen.getByTitle(ON_REQUEST_TITLE)).toHaveTextContent('na żądanie')
    // street name shown somewhere on the route
    expect(screen.getByText('Marszałkowska')).toBeInTheDocument()
    // mini-legend
    expect(screen.getByText('przystanek krańcowy')).toBeInTheDocument()
  })

  it('jeden górny rząd: ← do linii i ścieżka; nazwa linii to jedyny h1', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { level: 1, name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('link', { name: 'Wróć do linii' })).toHaveAttribute('href', '/city/warszawa/lines')
    const nav = screen.getByRole('navigation', { name: 'Ścieżka nawigacji' })
    expect(within(nav).getByRole('link', { name: 'Linie' })).toHaveAttribute('href', '/city/warszawa/lines')
    expect(within(nav).getByText('Piaski – Międzylesie')).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('uses the primary colour tokens only — no indigo and no accent gradient left on the page', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    // Elementy własne strony (TopBar, `LineRouteList`, `LineTimetable` mają własne testy).
    const owned = [
      screen.getByRole('button', { name: 'Zmień kierunek' }),
      screen.getByRole('group', { name: 'Widok linii' }),
      screen.getByRole('group', { name: 'Wybrany rozkład' }),
      screen.getByRole('link', { name: 'Odjazdy z przystanku' }),
      screen.getByRole('region', { name: 'Pojazdy linii' }),
      screen.getByRole('link', { name: 'Pojazdy na mapie' }),
    ]
    for (const element of owned) {
      expect(element.outerHTML).not.toMatch(/indigo-|accent-gradient|accent-solid/)
    }
  })
})

describe('LineDetailPage — direction by id and URL state', () => {
  it('a direction with id 1 first in the array is shown first (no index = id assumption), and its vehicles are asked for', async () => {
    const fetchMock = stubFetch(lineWith([DIR1, DIR0]))
    render(<LineDetailPage />)
    expect(await screen.findByText('Od: Dworzec Centralny')).toBeInTheDocument()
    expect(screen.getByText('Centrum', { selector: 'p' })).toBeInTheDocument()
    await screen.findByTestId('mover')
    expect(callsTo(fetchMock, '/api/gtfs/vehicles').every(([url]) => String(url).includes('direction=1'))).toBe(true)
  })

  it('switching direction writes dir=<id>, clears stop, selects the first stop of the new direction and keeps other params', async () => {
    window.history.replaceState(null, '', '/city/warszawa/line/20?stop=500801&foo=bar')
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    const capsule = screen.getByRole('group', { name: 'Wybrany rozkład' })
    expect(capsule).toHaveTextContent('Metro Politechnika 14')

    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('1')
    expect(search().has('stop')).toBe(false)
    expect(search().get('foo')).toBe('bar')
    expect(screen.getByText('Od: Dworzec Centralny')).toBeInTheDocument()
    // Krótsza trasa: wybór nie przenosi starego indeksu — pierwszy przystanek nowego kierunku.
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Dworzec Centralny')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).not.toHaveTextContent('Metro Politechnika')

    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('0')
    expect(screen.getByText('Od: Centrum')).toBeInTheDocument()
  })

  it('with three directions the swap button cycles through all of them', async () => {
    const DIR2 = { ...DIR1, directionId: 2, headsign: 'Zajezdnia', origin: 'Centrum' }
    stubFetch(lineWith([DIR0, DIR1, DIR2]))
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('2')
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('0')
  })

  it('a single direction has no swap button (not a disabled dead control)', async () => {
    stubFetch(lineWith([DIR0]))
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.queryByRole('button', { name: /zmień kierunek/i })).not.toBeInTheDocument()
  })

  it('the selected course is cleared when the direction changes (and does not come back)', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: '06:00' }))
    expect(screen.getByText('06:05')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(screen.getByText('Od: Centrum')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '06:00' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('06:05')).not.toBeInTheDocument()
  })

  it('picking a stop writes stop=<id> (with the resolved dir) and keeps the pane on desktop', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: /Rondo ONZ/ }))
    expect(search().get('stop')).toBe('700201')
    expect(search().get('dir')).toBe('0')
    // Od `lg` obie sekcje są obok siebie — wybór przystanku nie przełącza widoku.
    expect(search().has('pane')).toBe(false)
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Rondo ONZ 02')
  })

  it('a bad dir/stop in the URL falls back silently to the first direction and its first stop', async () => {
    window.history.replaceState(null, '', '/city/warszawa/line/20?dir=9&stop=nie-ma-takiego&pane=x')
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByText('Od: Centrum')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Centrum 01')
  })

  it('?stop= alone picks the first direction that contains the stop', async () => {
    window.history.replaceState(null, '', '/city/warszawa/line/20?stop=900901')
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByText('Od: Dworzec Centralny')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Dworzec Centralny')
  })

  it('?dir=1 selects that direction and the map link carries line + dir', async () => {
    window.history.replaceState(null, '', '/city/warszawa/line/20?dir=1')
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByText('Od: Dworzec Centralny')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pojazdy na mapie' })).toHaveAttribute('href', '/city/warszawa/map?line=20&dir=1')
  })

  it('a pin click on the map selects that stop by id, through one stable callback (the map is never remounted by it)', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(await screen.findByTestId('map-pin-1'))
    expect(search().get('stop')).toBe('700201')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Rondo ONZ 02')
    // Trap 2 (`maps.md`): nowa tożsamość `onPinClick` odmontowuje mapę razem z popupem.
    expect(new Set(pinClickHandlers).size).toBe(1)
  })

  it('state is per line: another line id resets direction, stop and pane choices', async () => {
    stubFetch()
    const user = userEvent.setup()
    const { rerender } = render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(screen.getByText('Od: Dworzec Centralny')).toBeInTheDocument()

    params.routeId = '21'
    window.history.replaceState(null, '', '/city/warszawa/line/21')
    rerender(<LineDetailPage />)
    expect(await screen.findByText('Od: Centrum')).toBeInTheDocument()
  })
})

describe('LineDetailPage — pane switch', () => {
  it('below lg a „Trasa | Rozkład” switch shows one section; tapping a stop switches to its timetable and writes pane=timetable', async () => {
    stubMatchMedia(false)
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    const views = screen.getByRole('group', { name: 'Widok linii' })
    const route = within(views).getByRole('button', { name: 'Trasa' })
    const timetable = within(views).getByRole('button', { name: 'Rozkład' })
    expect(route).toHaveAttribute('aria-pressed', 'true')
    expect(timetable).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('group', { name: 'Wybrany rozkład' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Rondo ONZ/ }))
    expect(timetable).toHaveAttribute('aria-pressed', 'true')
    expect(search().get('pane')).toBe('timetable')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Rondo ONZ 02')
    expect(screen.queryByRole('heading', { name: /Trasa linii/ })).not.toBeInTheDocument()
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()

    await user.click(route)
    expect(route).toHaveAttribute('aria-pressed', 'true')
    expect(search().has('pane')).toBe(false)
    expect(screen.getByRole('heading', { name: /Trasa linii/ })).toBeInTheDocument()
  })

  it('switching the pane writes the resolved dir/stop (not a bad URL value) and keeps ?day=', async () => {
    window.history.replaceState(null, '', '/city/warszawa/line/20?dir=9&stop=nie-ma-takiego&day=sunday')
    stubMatchMedia(false)
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(within(screen.getByRole('group', { name: 'Widok linii' })).getByRole('button', { name: 'Rozkład' }))
    expect(search().get('pane')).toBe('timetable')
    expect(search().get('dir')).toBe('0')
    expect(search().get('stop')).not.toBe('nie-ma-takiego')
    expect(search().get('day')).toBe('sunday')
  })

  it('at lg and above both sections show and a stop click does not switch the pane', async () => {
    stubMatchMedia(true)
    stubFetch()
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: /Rondo ONZ/ }))
    expect(search().has('pane')).toBe(false)
    expect(screen.getByRole('heading', { name: /Trasa linii/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toBeInTheDocument()
  })

  // Regresja z QA w przeglądarce: od `lg` obie sekcje są zamontowane, a ich `ViewTransition` miały jedną nazwę
  // („two <ViewTransition name> components with the same name") — to przerywa przejście (ui-motion.md).
  it('at lg and above the two mounted sections never share a view-transition name', async () => {
    stubMatchMedia(true)
    stubFetch()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    const duplicates = errors.mock.calls.filter((call) => String(call[0]).includes('same name'))
    errors.mockRestore()
    expect(duplicates).toEqual([])
  })

  it('?pane=timetable opens the timetable below lg', async () => {
    stubMatchMedia(false)
    window.history.replaceState(null, '', '/city/warszawa/line/20?pane=timetable')
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByRole('button', { name: 'Rozkład' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toBeInTheDocument()
  })

  it('the timetable pane has the context capsule (line · direction · stop) and the link to the stop board', async () => {
    stubFetch()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    const capsule = screen.getByRole('group', { name: 'Wybrany rozkład' })
    expect(capsule).toHaveTextContent('20')
    expect(capsule).toHaveTextContent('Dworzec Centralny')
    expect(capsule).toHaveTextContent('Centrum 01')
  })
})

describe('LineDetailPage — long names, empty and unknown data', () => {
  it('renders a very long headsign and stop name in full (wrapping, never truncated)', async () => {
    const headsign = 'Bardzo Długa Nazwa Kierunku Końcowego Która Nie Mieści Się W Jednym Wierszu Na Telefonie Z Trzystu Dwudziestu Pikseli'
    const stopName = 'Przystanek Z Niezwykle Długą Nazwą Wymagającą Zawijania Tekstu W Wielu Wierszach Listy Trasy'
    stubFetch(lineWith([{ ...DIR0, headsign, stops: [{ ...DIR0_STOPS[0], name: stopName, code: null }, ...DIR0_STOPS.slice(1)] }, DIR1]))
    render(<LineDetailPage />)
    const head = await screen.findByText(headsign, { selector: 'p' })
    expect(head).not.toHaveClass('truncate')
    expect(screen.getAllByText(stopName, { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent(stopName)
  })

  it('without a headsign the direction is named after ITS last stop; without stops „Kierunek nieznany” — origin is never the destination', async () => {
    stubFetch(lineWith([{ ...DIR0, headsign: null }, { ...DIR1, headsign: null, stops: [] }]))
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.getByText('Metro Politechnika', { selector: 'p' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(screen.getByText('Kierunek nieznany', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/^Kierunek 2$/)).not.toBeInTheDocument()
  })

  it('a direction without a known origin shows no „Od:” line', async () => {
    stubFetch(lineWith([{ ...DIR0, origin: null }, DIR1]))
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(screen.queryByText(/^Od:/)).not.toBeInTheDocument()
  })

  it('empty stops: a message and no crash (the timetable and the header stay)', async () => {
    stubFetch(lineWith([{ ...DIR0, stops: [] }]))
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    expect(screen.getByText('Brak przebiegu tej linii.')).toBeInTheDocument()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('no directions at all: a message, no direction card, no crash — alerts section still there', async () => {
    stubFetch(lineWith([]))
    render(<LineDetailPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    expect(screen.getByText('Brak przebiegu tej linii.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zmień kierunek/i })).not.toBeInTheDocument()
    expect(screen.getByText('Komunikaty linii 20')).toBeInTheDocument()
  })

  it('explains an unknown line with a way back to the catalogue instead of rendering an empty page', async () => {
    stubFetch({ ...LINE, line: null })
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie znaleziono linii')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do katalogu linii' })).toHaveAttribute('href', '/city/warszawa/lines')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('says the schedule is still loading (skeleton, not „Nie znaleziono linii”) when the feed is not ready', async () => {
    stubFetch({ ...LINE, line: null, schedule: { ...LINE.schedule, state: 'loading' } })
    render(<LineDetailPage />)
    expect(await screen.findByText('Wczytywanie rozkładu…')).toBeInTheDocument()
    expect(screen.getByTestId('line-loading')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Nie znaleziono linii')).not.toBeInTheDocument()
  })

  it('keeps the weather chip in the top bar even before the line loads', async () => {
    stubFetch({ ...LINE, line: null, schedule: { ...LINE.schedule, state: 'loading' } })
    render(<LineDetailPage />)
    expect(await screen.findByRole('button', { name: /^Pogoda:/ })).toBeInTheDocument()
    // Karta „Linia X" zależy od danych linii — jej brak podczas ładowania jest w porządku.
    expect(screen.queryByRole('heading', { name: /^Linia / })).not.toBeInTheDocument()
  })

  it('shows a skeleton with one h1 — not „Nie znaleziono linii” — while the first fetch is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/gtfs/line') ? new Promise(() => {}) : jsonResponse({ cities: [] }))))
    render(<LineDetailPage />)
    const skeleton = await screen.findByTestId('line-loading')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Nie znaleziono linii')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows an error state with a retry button and a way back when the first fetch fails; the button refetches', async () => {
    let calls = 0
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/gtfs/line')) return ++calls === 1 ? Promise.reject(new Error('x')) : jsonResponse(LINE)
      if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse(VEHICLES_READY)
      return jsonResponse({ cities: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do katalogu linii' })).toHaveAttribute('href', '/city/warszawa/lines')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
    expect(callsTo(fetchMock, '/api/gtfs/line')).toHaveLength(2)
  })

  it('a failed schedule with no line is an error with retry, not „Nie znaleziono linii”', async () => {
    stubFetch({ ...LINE, line: null, schedule: { ...LINE.schedule, state: 'failed' } })
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
    expect(screen.queryByText('Nie znaleziono linii')).not.toBeInTheDocument()
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

  it('a failed refresh keeps the route on screen and turns the fetch-age line into the stale warning', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          // Pierwsza odpowiedź ma feed alertów `failed` → odświeżenie co 5 min (`lineRefreshMs`), drugie pada.
          if (url.startsWith('/api/gtfs/line?'))
            return ++calls === 1 ? jsonResponse({ ...LINE, alerts: [], alertFeed: { state: 'failed', fetchedAt: '2026-09-03T09:00:00.000Z', ageMs: 1000 } }) : Promise.reject(new Error('x'))
          if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } })
          return jsonResponse({ cities: [] })
        })
      )
      render(<LineDetailPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Pobrano/ })).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(5 * 60_000 + 100))
      expect(screen.getByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Nie udało się odświeżyć · dane z/ })).toBeInTheDocument()
      expect(screen.queryByText('Nie udało się pobrać przebiegu linii.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('LineDetailPage — vehicles', () => {
  it('unknown direction (id 2): no vehicle request, the map link has no dir and the explanation shows', async () => {
    const fetchMock = stubFetch(lineWith([{ ...DIR0, directionId: 2 }]))
    render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    expect(await screen.findByText('Kierunek nieznany — pokazujemy pojazdy bez rozróżnienia kierunku.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pojazdy na mapie' })).toHaveAttribute('href', '/city/warszawa/map?line=20')
    expect(callsTo(fetchMock, '/api/gtfs/vehicles')).toHaveLength(0)
    expect(screen.queryByTestId('mover')).not.toBeInTheDocument()
  })

  it('known direction 0: the map link carries dir=0 and the count + GPS age show', async () => {
    stubFetch()
    render(<LineDetailPage />)
    expect(await screen.findByText('Pojazdy w tym kierunku: 1')).toBeInTheDocument()
    expect(screen.getByText('GPS: 10 s temu')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pojazdy na mapie' })).toHaveAttribute('href', '/city/warszawa/map?line=20&dir=0')
  })

  const STATUS_TEXTS = ['Wczytywanie pozycji…', 'Nie udało się pobrać pozycji.', 'Brak danych o pozycjach pojazdów', 'Brak pojazdów w tym kierunku.']

  // Pozycje są osobnym stanem od przebiegu i rozkładu (#7): trasa zostaje w każdym z nich, a teksty się nie mieszają.
  it.each([
    ['loading', 'Wczytywanie pozycji…', () => new Promise(() => {})],
    ['failed', 'Nie udało się pobrać pozycji.', () => Promise.reject(new Error('x'))],
    ['no feed (not ready)', 'Brak danych o pozycjach pojazdów', () => jsonResponse({ vehicles: [], feed: { state: 'idle', ageMs: null } })],
    ['ready and empty', 'Brak pojazdów w tym kierunku.', () => jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } })],
  ])('vehicle state %s shows only its own text and keeps the route', async (_name, text, vehiclesResponse) => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.startsWith('/api/gtfs/line') ? jsonResponse(LINE) : url.startsWith('/api/gtfs/vehicles') ? vehiclesResponse() : jsonResponse({ cities: [] })))
    )
    render(<LineDetailPage />)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Trasa linii/ })).toBeInTheDocument()
    for (const other of STATUS_TEXTS.filter((t) => t !== text)) expect(screen.queryByText(other)).not.toBeInTheDocument()
  })
})

describe('LineDetailPage — alerts', () => {
  const FAILED_NEVER = { state: 'failed', fetchedAt: null, ageMs: null }
  const FAILED_STALE = { state: 'failed', fetchedAt: '2026-09-03T09:00:00.000Z', ageMs: 1000 }

  it('a failed feed with no data says it could not load — not „Brak komunikatów” — and the route still renders', async () => {
    stubFetch({ ...LINE, alerts: [], alertFeed: FAILED_NEVER })
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się wczytać komunikatów')).toBeInTheDocument()
    expect(screen.queryByText('Brak komunikatów dla tego kontekstu')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Trasa linii/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    // #7: awaria ≠ „brak" → bez skrótu.
    expect(screen.queryByRole('button', { name: /komunikat/ })).not.toBeInTheDocument()
  })

  it('a failed refresh with a last known list keeps the list and warns it is stale', async () => {
    stubFetch({ ...LINE, alerts: [ALERT], alertFeed: FAILED_STALE })
    render(<LineDetailPage />)
    expect(await screen.findByText('Nie udało się odświeżyć. Pokazujemy ostatnie dane')).toBeInTheDocument()
    expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
  })

  it('a ready feed with no alerts says so, and offers no shortcut', async () => {
    stubFetch({ ...LINE, alerts: [], alertFeed: { state: 'ready', fetchedAt: '2026-09-03T09:00:00.000Z', ageMs: 1000 } })
    render(<LineDetailPage />)
    expect(await screen.findByText('Brak komunikatów dla tego kontekstu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /komunikat/ })).not.toBeInTheDocument()
  })

  it('known alerts: a shortcut with the deduplicated count scrolls to the alerts section (no banner)', async () => {
    stubFetch({ ...LINE, alerts: [ALERT, { ...ALERT }, { ...ALERT, id: 'b', title: 'Drugi komunikat' }] })
    const user = userEvent.setup()
    render(<LineDetailPage />)
    const shortcut = await screen.findByRole('button', { name: '2 komunikaty' })
    expect(screen.getByText('Komunikaty linii 20')).toBeInTheDocument()
    expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
    vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear()
    await user.click(shortcut)
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('one alert uses the singular form', async () => {
    stubFetch({ ...LINE, alerts: [ALERT] })
    render(<LineDetailPage />)
    expect(await screen.findByRole('button', { name: '1 komunikat' })).toBeInTheDocument()
  })

  it('refetches while alerts are unknown (null): „Wczytywanie komunikatów…” first, then the alert', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/gtfs/line?')) return jsonResponse({ ...LINE, alerts: ++calls === 1 ? null : [ALERT] })
          if (url.startsWith('/api/gtfs/vehicles')) return jsonResponse({ vehicles: [], feed: { state: 'ready', ageMs: 0 } })
          return jsonResponse({ cities: [] })
        })
      )
      render(<LineDetailPage />)
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('heading', { name: 'Piaski – Międzylesie' })).toBeInTheDocument()
      expect(screen.getByText('Wczytywanie komunikatów…')).toBeInTheDocument() // nieznane != brak
      expect(screen.queryByText('Utrudnienia na linii 20')).not.toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(1_000)) // pierwszy stopień drabinki
      expect(calls).toBe(2)
      expect(screen.getByText('Utrudnienia na linii 20')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('LineDetailPage — theme switch', () => {
  it('keeps pane, direction, stop and course, and neither refetches nor records the line again', async () => {
    stubMatchMedia(false)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchMock = stubFetch()
    const user = userEvent.setup()
    const { rerender } = render(<LineDetailPage />)
    await screen.findByRole('heading', { name: 'Piaski – Międzylesie' })
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    await user.click(screen.getByRole('button', { name: /Rondo ONZ/ })) // → Rozkład
    await user.click(screen.getByRole('button', { name: '06:05' })) // kurs 06:00 z Centrum = 06:05 na Rondzie ONZ
    const lineCalls = callsTo(fetchMock, '/api/gtfs/line').length
    const recents = () => setItem.mock.calls.filter(([key]) => key === 'monitor.recentLines.v1').length
    expect(recents()).toBe(1)

    themeState.resolvedTheme = 'dark'
    rerender(<LineDetailPage />)

    expect(screen.getByRole('button', { name: 'Rozkład' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Rondo ONZ 02')
    expect(screen.getByRole('button', { name: '06:05' })).toHaveAttribute('aria-pressed', 'true')
    expect(search().get('dir')).toBe('0')
    expect(search().get('stop')).toBe('700201')
    expect(search().get('pane')).toBe('timetable')
    expect(callsTo(fetchMock, '/api/gtfs/line')).toHaveLength(lineCalls)
    expect(recents()).toBe(1)
  })
})

describe.each([
  ['bus', 'regular'],
  ['tram', 'regular'],
  ['metro', 'regular'],
  ['rail', 'regular'],
] as const)('LineDetailPage — %s line', (mode, kind) => {
  it('shows the mode icon + label, and the same direction / stop / timetable / alerts flow — no PKP request', async () => {
    const fetchMock = stubFetch(
      { ...LINE, line: { ...LINE.line, mode, kind }, alerts: [ALERT] },
      // Metro / kolej: brak feedu pozycji — trasa i rozkład działają dalej.
      mode === 'metro' || mode === 'rail' ? { vehicles: [], feed: { state: 'idle', ageMs: null } } : VEHICLES_READY
    )
    const user = userEvent.setup()
    render(<LineDetailPage />)
    await screen.findByRole('heading', { level: 1, name: 'Piaski – Międzylesie' })

    const sub = screen.getByTestId('line-mode')
    expect(sub).toHaveTextContent(MODE_LABEL[mode])
    const Icon = MODE_ICON[mode]
    const { container: reference } = render(<Icon size={ICON_SIZE.inline} />)
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container -- porównanie znacznika ikony nagłówka z MODE_ICON[mode]
    expect(sub.querySelector('svg')?.outerHTML).toBe(reference.querySelector('svg')?.outerHTML)

    await user.click(screen.getByRole('button', { name: 'Zmień kierunek' }))
    expect(search().get('dir')).toBe('1')
    await user.click(screen.getByRole('button', { name: /Centrum 03/ }))
    expect(search().get('stop')).toBe('100103')
    expect(screen.getByRole('group', { name: 'Wybrany rozkład' })).toHaveTextContent('Centrum 03')
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 komunikat' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pojazdy na mapie' })).toHaveAttribute('href', '/city/warszawa/map?line=20&dir=1')
    if (mode === 'metro' || mode === 'rail') expect(await screen.findByText('Brak danych o pozycjach pojazdów')).toBeInTheDocument()

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/train'))).toBe(false)
  })
})
