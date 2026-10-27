// @vitest-environment jsdom
import { act, fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react'
import { StrictMode, useEffect, type ReactElement, type ReactNode } from 'react'
import { MAP_ZOOM } from '@/components/map/mapData'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityMapPage from './page'
import type { MapHit, MapView } from '@/components/map/TransitMap'
import { UserLocationProvider } from '@/components/UserLocationProvider'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { useUserLocation } from '@/hooks/useUserLocation'
import { jsonResponse } from '@/test-utils/http'

// Strona czyta pozycję użytkownika z providera z layoutu `(app)` — w testach opakowujemy ją tak samo.
const render = (ui: ReactElement) => baseRender(ui, { wrapper: UserLocationProvider })

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let cityParam = 'warszawa'
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: () => notFound(),
}))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

const state = vi.hoisted(() => ({
  vehicles: {
    vehicles: [] as unknown[],
    feed: { state: 'ready', ageMs: 13_000 as number | null },
    alertLines: [] as string[],
    error: null as string | null,
  } as {
    vehicles: unknown[]
    feed: { state: string; ageMs: number | null }
    alertLines: string[]
    error: string | null
    /** Kiedy PRZEGLĄDARKA ostatnio pobrała odczyt (nagłówek: „pobrano N s temu”); brak = `null`. */
    lastSuccessAt?: number | null
  },
  stops: { stops: null as unknown[] | null, error: false },
  rail: { stations: null as unknown[] | null, error: false },
  /** Wywołania `useTransitBoard(city, stopIds, limit)` — podgląd odjazdów w „W pobliżu". */
  boardCalls: [] as unknown[][],
  /** Odpowiedź `/api/search` (wyszukiwarka na mapie). */
  search: [] as unknown[],
  mapProps: null as null | {
    initialCamera: { lat: number; lon: number; zoom: number }
    follow: { lat: number; lon: number } | null
    onUserMove: () => void
    /** Pasy zasłonięte przez pasek (góra) i arkusz (dół, tylko telefon) — padding kamery. */
    insets: { top: number; bottom: number }
    onContextPoint: (point: { lat: number; lon: number }) => void
    onVisibleChange: (items: { kind: 'vehicle' | 'stop' | 'rail'; id: string; label: string }[], overflow: boolean) => void
    pinnedItems: { lat: number; lon: number }[]
    onlyLines: Set<string> | null
    listOpen: boolean
    route: { key: string } | null
    focus: { lat: number; lon: number } | null
    routeId: string | null; hidden: Set<string>; selected: unknown; onSelect: (hit: MapHit | null) => void; onViewChange: (view: MapView) => void },
}))
vi.mock('@/hooks/useCityVehicles', () => ({ useCityVehicles: () => ({ ...state.vehicles, lastSuccessAt: state.vehicles.lastSuccessAt ?? null, now: Date.now() }) }))
vi.mock('@/hooks/useCityStops', () => ({ useCityStops: () => state.stops }))
vi.mock('@/hooks/useRailStations', () => ({
  useRailStations: () => state.rail,
  useRailStationStatus: () => ({ status: null, error: false }),
}))
vi.mock('@/hooks/useTransitBoard', () => ({
  useTransitBoard: (...args: unknown[]) => {
    state.boardCalls.push(args)
    return { data: null, error: null }
  },
}))
vi.mock('@/components/map/TransitMap', () => ({
  TransitMap: (props: NonNullable<typeof state.mapProps>) => {
    state.mapProps = props
    return <div data-testid="map" />
  },
}))

const VEHICLE = {
  id: 'v1', lat: 52.2, lon: 21.0, bearing: null, sideNumber: '3801', ageSec: 10, headsign: 'Centrum',
  routeId: '20', shortName: '20', mode: 'tram', kind: 'regular', directionId: 0, nextStop: { name: 'Rondo ONZ', groupId: '7002' },
}
const STOP = { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' }
const routeStop = (stopId: string, name: string, lat: number) => ({
  stopId, groupId: stopId.slice(0, 4), name, code: null, street: null, wheelchair: 0, lat, lon: 21.0, offsetSec: 0, onRequest: false,
})
const LINE_DETAIL = {
  routeId: '20', line: '20', longName: 'Boernerowo — Żerań', mode: 'tram', kind: 'regular',
  directions: [
    { directionId: 0, headsign: 'Żerań', origin: 'Boernerowo', departures: [], shape: null, stops: [routeStop('500101', 'Boernerowo', 52.26), routeStop('100101', 'Centrum', 52.23)] },
    { directionId: 1, headsign: 'Boernerowo', origin: 'Żerań', departures: [], shape: null, stops: [routeStop('900101', 'Żerań', 52.3)] },
  ],
}
const STATION = { id: '33605', name: 'Warszawa Centralna', lat: 52.2288, lon: 21.0033, tier: 1 }

function setWide(wide: boolean): void {
  // Zwykłe przypisanie, nie `vi.stubGlobal` — odmontowanie po teście (sprzątanie RTL) woła je
  // już PO `unstubAllGlobals`; jsdom nie ma własnego `matchMedia`.
  window.matchMedia = (() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  resetCitiesCacheForTests()
  window.localStorage.clear()
  cityParam = 'warszawa'
  window.history.replaceState(null, '', '/city/warszawa/map')
  state.vehicles = { vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 13_000 }, alertLines: [], error: null }
  state.stops = { stops: [STOP], error: false }
  state.rail = { stations: [STATION], error: false }
  state.mapProps = null
  state.search = []
  state.boardCalls = []
  setWide(true)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/search')) return jsonResponse({ stations: state.search, sources: { rail: 'ready', transit: 'ready' } })
      if (url.startsWith('/api/cities')) return jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })
      if (url.startsWith('/api/gtfs/backbone')) return jsonResponse({ lines: [] })
      if (url.startsWith('/api/gtfs/line?')) return jsonResponse({ schedule: { state: 'ready' }, line: LINE_DETAIL })
      if (url.startsWith('/api/gtfs/lines')) {
        return jsonResponse({
          city: 'warszawa',
          schedule: { state: 'ready' },
          lines: { tram: [{ routeId: '20', line: '20', longName: 'Boernerowo — Żerań', mode: 'tram', kind: 'regular' }] },
          attribution: [],
        })
      }
      return jsonResponse({ stations: [] })
    })
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('exact vehicle deep links', () => {
  const target = { ...VEHICLE, tripId: 't1', serviceDate: '2026-10-25' }
  it('opens the exact vehicle card and camera without following it', async () => {
    state.vehicles.vehicles = [target]
    window.history.replaceState(null, '', '/city/warszawa/map?vehicle=v1&trip=t1&date=2026-10-25&hide=trams&alerts=1')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps?.selected).toMatchObject({ id: 'v1', tripId: 't1' }))
    expect(state.mapProps?.focus).toMatchObject({ lat: target.lat, lon: target.lon })
    expect(state.mapProps?.follow).toBeNull()
    expect(state.mapProps?.hidden.has('trams')).toBe(false)
  })
  it('opens raw GPS by exact id and trip without a resolved date', async () => {
    state.vehicles.vehicles = [{ ...target, serviceDate: null }]
    window.history.replaceState(null, '', '/city/warszawa/map?vehicle=v1&trip=t1')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps?.selected).toMatchObject({ id: 'v1', tripId: 't1' }))
    expect(state.mapProps?.focus).toMatchObject({ lat: target.lat, lon: target.lon })
    expect(state.mapProps?.follow).toBeNull()
  })
  it('keeps a known service date guarded even when raw links can omit it', async () => {
    state.vehicles.vehicles = [{ ...target, serviceDate: '2026-10-26' }]
    window.history.replaceState(null, '', '/city/warszawa/map?vehicle=v1&trip=t1&date=2026-10-25')
    render(<CityMapPage />)
    expect(await screen.findByText('Wskazany pojazd nie jest dostępny dla tego kursu.')).toBeInTheDocument()
    expect(state.mapProps?.focus).toBeNull()
  })
  it('does not substitute the same vehicle running another trip', async () => {
    state.vehicles.vehicles = [{ ...target, tripId: 'another' }]
    window.history.replaceState(null, '', '/city/warszawa/map?vehicle=v1&trip=t1&date=2026-10-25')
    render(<CityMapPage />)
    expect(await screen.findByText('Wskazany pojazd nie jest dostępny dla tego kursu.')).toBeInTheDocument()
    expect(state.mapProps?.focus).toBeNull()
  })
  it('stops binding the expected course after selecting a different object', async () => {
    state.vehicles.vehicles = [target]
    window.history.replaceState(null, '', '/city/warszawa/map?vehicle=v1&trip=t1&date=2026-10-25')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps?.selected).toMatchObject({ id: 'v1', tripId: 't1' }))
    act(() => state.mapProps?.onSelect({ kind: 'stop', id: STOP.id }))
    expect(new URLSearchParams(window.location.search).has('vehicle')).toBe(false)
    await waitFor(() => expect(state.mapProps?.selected).toMatchObject({ lat: STOP.lat, lon: STOP.lon }))
  })
})

const map = () => state.mapProps!

/** Zegar strony stoi (tylko `Date`): odczyt sprzed 13 s daje w nagłówku dokładnie „pobrano 13 s temu”. */
function fetchedSecondsAgo(seconds: number): number {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_760_000_000_000)
  return Date.now() - seconds * 1000
}

describe('CityMapPage', () => {
  it('404s for a city outside the registry', () => {
    cityParam = 'atlantyda'
    expect(() => render(<CityMapPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('has no city picker while the registry holds a single city', async () => {
    state.vehicles.lastSuccessAt = fetchedSecondsAgo(13)
    render(<CityMapPage />)
    await screen.findByText('Warszawa · pobrano 13 s temu')
    expect(screen.queryByRole('combobox', { name: 'Miasto' })).not.toBeInTheDocument()
  })

  it('shows the freshness of vehicle positions in the header, in three distinct states', () => {
    // „pobrano" = kiedy przeglądarka pobrała odczyt (rośnie z zegarem), nie wiek próbki z serwera (osobno: „Pozycje sprzed" w przeglądzie).
    state.vehicles.lastSuccessAt = fetchedSecondsAgo(13)
    const { rerender } = render(<CityMapPage />)
    expect(screen.getByText('Warszawa · pobrano 13 s temu')).toBeInTheDocument()
    state.vehicles = { vehicles: [], feed: { state: 'loading', ageMs: null }, alertLines: [], error: null }
    rerender(<CityMapPage />)
    expect(screen.getByText(/wczytywanie pozycji pojazdów/)).toBeInTheDocument()
    state.vehicles = { vehicles: [], feed: { state: 'failed', ageMs: null }, alertLines: [], error: 'x' }
    rerender(<CityMapPage />)
    expect(screen.getByText(/nie udało się pobrać pozycji pojazdów/)).toBeInTheDocument()
    state.vehicles = { vehicles: [VEHICLE], feed: { state: 'failed', ageMs: 400_000 }, alertLines: [], error: null }
    rerender(<CityMapPage />)
    expect(screen.getByText(/pokazujemy ostatnie dostępne/)).toBeInTheDocument()
  })

  it('a failed refresh with the last positions says from when they are (city time zone), not just that they are stale', () => {
    // 2026-10-17 10:30 UTC = 12:30 w Warszawie (CEST).
    state.vehicles = { vehicles: [VEHICLE], feed: { state: 'failed', ageMs: 400_000 }, alertLines: [], error: null, lastSuccessAt: Date.UTC(2026, 9, 17, 10, 30) }
    render(<CityMapPage />)
    expect(screen.getByText(/pozycje pojazdów nieaktualne — pokazujemy ostatnie dostępne · dane z 12:30$/)).toBeInTheDocument()
  })

  it('restores filters and the line from the URL, shows them as removable chips', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?hide=busStops&line=20')
    render(<CityMapPage />)
    const chips = await screen.findByRole('list', { name: 'Aktywne filtry' })
    expect(await within(chips).findByText('Linia 20')).toBeInTheDocument()
    expect(within(chips).getByText('Ukryte: przystanki autobusowe')).toBeInTheDocument()
    expect(map().routeId).toBe('20')
    expect([...map().hidden]).toEqual(['busStops'])

    fireEvent.click(screen.getByRole('button', { name: 'Pokaż: przystanki autobusowe' }))
    expect(window.location.search).toBe('?line=20')
    fireEvent.click(screen.getByRole('button', { name: /Pokaż wszystkie linie/ }))
    expect(window.location.search).toBe('')
  })

  it('resolves an old ?line=<number> link and ignores a malformed one', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=%3Cscript%3E')
    render(<CityMapPage />)
    await waitFor(() => expect(map().routeId).toBeNull())
    expect(screen.queryByRole('list', { name: 'Aktywne filtry' })).toBeNull()
  })

  it('opens the right card for each kind of map hit and closes on an empty click', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())

    map().onSelect({ kind: 'vehicle', id: 'v1' })
    expect(await screen.findByRole('dialog', { name: 'tramwaj 20' })).toBeInTheDocument()
    expect(map().selected).toMatchObject({ lat: 52.2, lon: 21.0 })

    map().onSelect({ kind: 'stop', id: '100101' })
    expect(await screen.findByRole('dialog', { name: 'Centrum 01' })).toBeInTheDocument()

    map().onSelect({ kind: 'rail', id: '33605' })
    expect(await screen.findByRole('dialog', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Wybrany obiekt' })).toBeInTheDocument()

    map().onSelect(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says a selected vehicle lost its position rather than showing an empty card or a fake-current point', async () => {
    const { rerender } = render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    await screen.findByRole('dialog')
    state.vehicles = { vehicles: [{ ...VEHICLE, ageSec: 500 }], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
    rerender(<CityMapPage />)
    expect(await screen.findByText('Utracono pozycję pojazdu — ostatnia sprzed 8 min')).toBeInTheDocument()
    // Mapa nie rysuje wyróżnienia na martwym punkcie.
    expect(map().selected).toBeNull()
    state.vehicles = { vehicles: [], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
    rerender(<CityMapPage />)
    expect(await screen.findByText(/Pojazd zniknął z mapy/)).toBeInTheDocument()
  })

  it('tells the user when the view leaves the city transit area', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onViewChange({ center: { lat: 51.76, lon: 19.46 }, zoom: 12 })
    expect(await screen.findByText('Przystanki i pojazdy miejskie: tylko Warszawa i okolice')).toBeInTheDocument()
  })

  it('reports failed stop and station loads instead of hiding them', () => {
    state.stops = { stops: null, error: true }
    state.rail = { stations: null, error: true }
    render(<CityMapPage />)
    expect(screen.getByText(/Nie udało się wczytać przystanków/)).toBeInTheDocument()
    expect(screen.getByText(/Nie udało się wczytać stacji kolejowych/)).toBeInTheDocument()
  })

  it('on a phone: one search field replaces the Przystanek/Linia tabs; the card is a bottom sheet', async () => {
    setWide(false)
    render(<CityMapPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }))
    expect(screen.getAllByRole('searchbox', { name: 'Stacja, przystanek, linia lub pociąg' })).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Czego szukasz' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Przystanek' })).toBeNull()

    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'rail', id: '33605' })
    expect(await screen.findByRole('dialog', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Wybrany obiekt' })).toBeNull()
  })
})

describe('CityMapPage — line mode', () => {
  it.each(['loading', 'failed'])('keeps an initial %s source unknown even after an HTTP success', async (feedState) => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=20')
    state.vehicles = { vehicles: [], feed: { state: feedState, ageMs: null }, alertLines: [], error: null, lastSuccessAt: Date.now() }
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(within(panel).queryByText(/Dostępne pozycje pojazdów: 0/)).toBeNull()
    expect(within(panel).getByText(feedState === 'loading' ? /Wczytywanie pozycji pojazdów/ : /Pozycje pojazdów: brak danych/)).toBeInTheDocument()
  })
  it('retains a known empty vehicle snapshot on a failed refresh instead of changing zero into unknown', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=20')
    state.vehicles = { vehicles: [], feed: { state: 'failed', ageMs: 13_000 }, alertLines: [], error: 'failed', lastSuccessAt: Date.now() }
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(within(panel).getByText(/Dostępne pozycje pojazdów: 0/)).toBeInTheDocument()
    expect(within(panel).getByText(/Pokazujemy ostatnie dane/)).toBeInTheDocument()
  })
  it('shows the line panel with the route, switches direction into the URL, opens a stop, exits with ×', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=20')
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(await within(panel).findByText('Boernerowo Żerań')).toBeInTheDocument()
    expect(within(panel).getByRole('img', { name: 'do' })).toBeInTheDocument()
    expect(within(panel).getByText(/Dostępne pozycje pojazdów: 1/)).toBeInTheDocument()
    await waitFor(() => expect(map().route?.key).toBe('20:0'))

    fireEvent.click(within(panel).getByRole('button', { name: 'Zmień kierunek' }))
    expect(window.location.search).toBe('?line=20&dir=1')
    await waitFor(() => expect(map().route?.key).toBe('20:1'))

    fireEvent.click(within(panel).getByRole('button', { name: /Żerań/ }))
    expect(await screen.findByRole('dialog', { name: 'Żerań' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij kartę' }))
    const back = await screen.findByRole('dialog', { name: 'Linia 20' })

    fireEvent.click(within(back).getByRole('button', { name: 'Zakończ tryb linii' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.search).toBe('')
    expect(map().route).toBeNull()
  })

  it('the line panel carries the line alerts as ContextAlerts, from the one line fetch', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=20')
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(await within(panel).findByText('Komunikaty linii 20')).toBeInTheDocument()
    expect(within(panel).getByText('Brak komunikatów dla tego kontekstu')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/line?'))).toHaveLength(1)
  })

  it('rail GTFS line never calls /api/train', async () => {
    const delegate = vi.mocked(fetch)
    const railDetail = { ...LINE_DETAIL, routeId: 'S1', line: 'S1', mode: 'rail', directions: [LINE_DETAIL.directions[0]] }
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/gtfs/lines')) {
        return jsonResponse({ city: 'warszawa', schedule: { state: 'ready' }, lines: { rail: [{ routeId: 'S1', line: 'S1', longName: 'Pruszków — Otwock', mode: 'rail', kind: 'regular' }] }, attribution: [] })
      }
      if (url.startsWith('/api/gtfs/line?')) return jsonResponse({ schedule: { state: 'ready' }, line: railDetail })
      return delegate(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', '/city/warszawa/map?line=S1')
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia S1' })
    expect(within(panel).getByText(/kolej · Dostępne pozycje pojazdów: 0/)).toBeInTheDocument()
    // Przystanek z przebiegu kolei miejskiej: karta z własnym rodzajem (nie „Przystanek autobusowy").
    fireEvent.click(await within(panel).findByRole('button', { name: /Boernerowo/ }))
    expect(await screen.findByText('Stacja kolei miejskiej')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/train'))).toEqual([])
  })

  it('"Pokaż trasę" in a vehicle card enters line mode in the vehicle direction', async () => {
    state.vehicles = { vehicles: [{ ...VEHICLE, directionId: 1 }], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj' }))
    await screen.findByRole('searchbox', { name: 'Stacja, przystanek, linia lub pociąg' })
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Pokaż trasę na mapie' }))
    expect(await screen.findByRole('dialog', { name: 'Linia 20' })).toBeInTheDocument()
    expect(window.location.search).toBe('?line=20&dir=1')
  })
})

describe('CityMapPage — overview sheet (phone)', () => {
  const sheet = () => document.querySelector<HTMLElement>('.bottom-sheet')! // eslint-disable-line testing-library/no-node-access -- kontener przewijania nie ma roli
  const overview = () => screen.getByRole('region', { name: 'Pojazdy i przystanki w widoku' })
  const inside = (el: HTMLElement, selector: string) => el.closest(selector) !== null // eslint-disable-line testing-library/no-node-access -- arkusz i jego slot nie mają ról

  beforeEach(() => setWide(false))

  it('with nothing selected the phone shows the overview in a peek sheet, reporting what is in view', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(sheet()).toHaveAttribute('data-snap', 'peek')
    expect(screen.queryByRole('dialog')).toBeNull()
    // Mapa liczy kadr też bez otwartej listy — z tego żyje podsumowanie.
    expect(map().listOpen).toBe(true)
    expect(within(overview()).getByText('Liczę obiekty w kadrze…')).toBeInTheDocument()
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }, { kind: 'stop', id: '100101', label: 'Centrum 01' }], false))
    expect(within(overview()).getByText('1 pojazd · 1 przystanek')).toBeInTheDocument()
    expect(within(overview()).getByText('Pozycje sprzed 10 s')).toBeInTheDocument() // wiek GPS widocznego pojazdu, nie 13 s pobrania
    expect(within(overview()).getByRole('list', { name: 'Legenda rodzajów' })).toBeInTheDocument()
    // Pełna legenda z boku jest tylko na szerokim ekranie: na telefonie legenda leży w arkuszu.
    expect(screen.queryByText('Legenda')).toBeNull()
  })

  it('vehicle rows in the overview list say how old the position is and open the card', async () => {
    render(<CityMapPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }], false))
    const row = within(overview()).getByRole('button', { name: /Linia 20 → Centrum/ })
    expect(row).toHaveTextContent('Pozycja sprzed 10 s')
    fireEvent.click(row)
    expect(await screen.findByRole('dialog', { name: 'tramwaj 20' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pojazdy i przystanki w widoku' })).toBeNull()
  })

  it('a vehicle that keeps its id but changes line updates the list label (the signature guard compares labels too)', async () => {
    render(<CityMapPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }], false))
    expect(within(overview()).getByRole('button', { name: /Linia 20 → Centrum/ })).toBeInTheDocument()
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '15' }], false))
    expect(within(overview()).getByRole('button', { name: /Linia 15 → Centrum/ })).toBeInTheDocument()
    expect(within(overview()).queryByRole('button', { name: /Linia 20 → Centrum/ })).toBeNull()
  })

  it('peek does not cover the locate control (control sits in the above slot)', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    const locate = screen.getByRole('button', { name: 'Moja lokalizacja' })
    expect(inside(locate, '.bottom-sheet__above')).toBe(true)
    expect(sheet()).toContainElement(locate)
    // Z kartą tak samo — arkusz niesie kontrolkę ze sobą.
    map().onSelect({ kind: 'rail', id: '33605' })
    await screen.findByRole('dialog', { name: 'Warszawa Centralna' })
    expect(inside(screen.getByRole('button', { name: 'Moja lokalizacja' }), '.bottom-sheet__above')).toBe(true)
  })

  it('statuses and the locate control share ONE bottom-aligned row of the above slot (a status never hides above the sheet edge)', async () => {
    state.rail = { stations: null, error: true }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    const locate = screen.getByRole('button', { name: 'Moja lokalizacja' })
    const problem = await screen.findByText('Nie udało się wczytać stacji kolejowych — ponawiam.')
    const row = locate.closest('.bottom-sheet__above > div') as HTMLElement // eslint-disable-line testing-library/no-node-access -- układ slotu nie ma ról
    expect(row).not.toBeNull()
    expect(row).toHaveClass('flex', 'items-end', 'justify-between')
    expect(row).toContainElement(problem)
    // Status po lewej zajmuje resztę szerokości i zawija tekst (`min-w-0 flex-1`), przycisk zostaje po prawej.
    expect(problem.closest('.min-w-0.flex-1')).not.toBeNull() // eslint-disable-line testing-library/no-node-access -- układ slotu nie ma ról
  })

  it('"Lista" opens the overview sheet at half and a second press brings it back to peek', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(sheet()).toHaveAttribute('data-snap', 'half')
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('dialog')).toBeNull() // jedna lista, nie druga obok przeglądu
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(sheet()).toHaveAttribute('data-snap', 'peek')
  })

  it('a feed that has never answered makes no age claim', async () => {
    state.vehicles = { vehicles: [], feed: { state: 'loading', ageMs: null }, alertLines: [], error: null }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(within(overview()).getByText('Wczytywanie pozycji pojazdów…')).toBeInTheDocument()
    expect(within(overview()).queryByText(/sprzed/)).toBeNull()
  })

  it('the overview age is the median GPS age of the visible vehicles, not the fetch age', async () => {
    state.vehicles = {
      vehicles: [{ ...VEHICLE, ageSec: 10 }, { ...VEHICLE, id: 'v2', ageSec: 30 }, { ...VEHICLE, id: 'v3', ageSec: 100 }],
      feed: { state: 'ready', ageMs: 2000 },
      alertLines: [],
      error: null,
    }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }, { kind: 'vehicle', id: 'v2', label: '20' }, { kind: 'vehicle', id: 'v3', label: '20' }], false))
    expect(within(overview()).getByText('Pozycje sprzed 30 s')).toBeInTheDocument()
    // Widoczne są tylko dwa: mediana liczy się z nich, nie z całego miasta.
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }, { kind: 'vehicle', id: 'v3', label: '20' }], false))
    expect(within(overview()).getByText('Pozycje sprzed 55 s')).toBeInTheDocument()
  })

  it('no visible vehicle means no age claim and no loading text once the feed answered (three distinct states)', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'stop', id: '100101', label: 'Centrum 01' }], false))
    expect(within(overview()).queryByText(/Pozycje sprzed/)).toBeNull() // nie podszywamy czasu pobrania pod wiek GPS
    expect(within(overview()).getByText('Brak pojazdów w widoku')).toBeInTheDocument()
    expect(within(overview()).queryByText(/Wczytywanie pozycji/)).toBeNull()
  })

  it('a ready feed with zero vehicles (night) is not "loading" forever', async () => {
    state.vehicles = { vehicles: [], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'stop', id: '100101', label: 'Centrum 01' }], false))
    expect(within(overview()).queryByText('Wczytywanie pozycji pojazdów…')).toBeNull()
    expect(within(overview()).getByText('Brak pojazdów w widoku')).toBeInTheDocument()
  })

  it('a failed refresh keeps the last positions and their growing GPS age in the note', async () => {
    state.vehicles = { vehicles: [{ ...VEHICLE, ageSec: 130 }], feed: { state: 'failed', ageMs: 130_000 }, alertLines: [], error: 'x' }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }], false))
    expect(within(overview()).getByText('Nie udało się odświeżyć · Pozycje sprzed 2 min')).toBeInTheDocument()
  })

  it('an idle event with an unchanged view does not re-render the page', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    const items = [{ kind: 'vehicle' as const, id: 'v1', label: '20' }, { kind: 'stop' as const, id: '100101', label: 'Centrum 01' }]
    act(() => map().onVisibleChange(items, false))
    const rendered = state.mapProps
    act(() => map().onVisibleChange(items.map((item) => ({ ...item })), false)) // te same obiekty, nowa tablica (jak z każdego `idle`)
    expect(state.mapProps).toBe(rendered)
    act(() => map().onVisibleChange(items, true)) // przepełnienie to zmiana
    expect(state.mapProps).not.toBe(rendered)
    const afterOverflow = state.mapProps
    act(() => map().onVisibleChange(items.slice(0, 1), true)) // inny skład to zmiana
    expect(state.mapProps).not.toBe(afterOverflow)
  })

  it('on a wide screen there is no sheet: the legend and the locate control stay on the map', async () => {
    setWide(true)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(screen.queryByRole('region', { name: 'Pojazdy i przystanki w widoku' })).toBeNull()
    expect(inside(screen.getByRole('button', { name: 'Moja lokalizacja' }), '.bottom-sheet')).toBe(false)
    expect(screen.getByText('Legenda')).toBeInTheDocument()
  })
})

describe('CityMapPage — camera insets', () => {
  // jsdom nie liczy układu: mapa ma 600 px, każdy zmierzony element 40 px (pasek u góry, slot `above` arkusza).
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
  })
  afterEach(() => vi.restoreAllMocks())
  const sheet = () => document.querySelector<HTMLElement>('.bottom-sheet')! // eslint-disable-line testing-library/no-node-access -- kontener przewijania nie ma roli

  it('on a phone the bottom inset is the settled visible sheet (peek, then half) plus the controls row on top', async () => {
    setWide(false)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(map().insets).toEqual({ top: 40, bottom: 190 }) // 25 % × 600 + slot `above`
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(map().insets).toEqual({ top: 40, bottom: 370 }) // half: 55 % × 600 + 40
  })

  it('at full the bottom inset keeps its last peek/half value', async () => {
    setWide(false)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    sheet().scrollTop = 330
    fireEvent.click(screen.getByRole('button', { name: /^Zmień wysokość panelu/ }))
    expect(sheet()).toHaveAttribute('data-snap', 'full')
    expect(map().insets.bottom).toBe(370)
  })

  it('switching from phone to wide drops the bottom inset to 0 (the sheet is gone)', async () => {
    setWide(false)
    const { rerender } = render(<CityMapPage />)
    await waitFor(() => expect(map().insets.bottom).toBe(190))
    setWide(true)
    rerender(<CityMapPage />)
    await waitFor(() => expect(map().insets.bottom).toBe(0))
  })

  it('on a wide screen a status notice does not grow the top inset: only the control row is measured (no camera re-ease on toasts)', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent?.includes('ponawiam') ? 100 : 40
    })
    state.rail = { stations: null, error: true }
    setWide(true)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(screen.getByText(/Nie udało się wczytać stacji kolejowych/)).toBeInTheDocument()
    expect(map().insets.top).toBe(40)
  })

  it('a wide screen has no sheet: nothing is covered at the bottom (the aside is a flex sibling of the map)', async () => {
    setWide(true)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(map().insets).toEqual({ top: 40, bottom: 0 })
  })
})

describe('CityMapPage — unified search', () => {
  const field = () => {
    const toggle = screen.getByRole('button', { name: 'Szukaj' })
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle)
    return screen.getByRole('searchbox', { name: 'Stacja, przystanek, linia lub pociąg' })
  }
  const MEMBER_2 = { id: '100102', groupId: '1001', name: 'Centrum', code: '02', lat: 52.25, lon: 21.03, mode: 'bus' }
  const linesCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/gtfs/lines'))

  it('map page fetches /api/gtfs/lines once', async () => {
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: '20' } })
    expect(await screen.findByRole('button', { name: /^Linia 20,/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Linia 20,/ }))
    await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(linesCalls()).toHaveLength(1)
  })

  it('picking a line sets ?line= and opens the line panel', async () => {
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: '20' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Linia 20,/ }))
    expect(await screen.findByRole('dialog', { name: 'Linia 20' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/city/warszawa/map')
    expect(window.location.search).toBe('?line=20')
    await waitFor(() => expect(map().routeId).toBe('20'))
    // Wybór zamyka panel wyników i czyści pole.
    expect(field()).toHaveValue('')
  })

  it('picking a line while a card is open replaces the card with the line panel', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'rail', id: '33605' })
    await screen.findByRole('dialog', { name: 'Warszawa Centralna' })
    fireEvent.change(field(), { target: { value: '20' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Linia 20,/ }))
    expect(await screen.findByRole('dialog', { name: 'Linia 20' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Warszawa Centralna' })).toBeNull()
  })

  it('picking a stop group selects a stop at a member position (no invented stop code)', async () => {
    state.stops = { stops: [STOP, MEMBER_2], error: false }
    // Pozycja z wyniku wyszukiwania celowo inna niż członków — liczy się pozycja przystanków z listy.
    state.search = [{ id: '1001', name: 'Centrum', kind: 'transit', mode: 'bus', lat: 10, lon: 10 }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Centrum' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Centrum, Zespół przystanków/ }))
    // Karta ZESPOŁU („Centrum"), nie pojedynczego słupka „Centrum 01".
    expect(await screen.findByRole('dialog', { name: 'Centrum' })).toBeInTheDocument()
    expect(map().selected).toEqual({ lat: (52.23 + 52.25) / 2, lon: (21.01 + 21.03) / 2 })
    expect(map().focus).toMatchObject({ lat: (52.23 + 52.25) / 2, lon: (21.01 + 21.03) / 2 })
    expect(window.location.pathname).toBe('/city/warszawa/map')
  })

  it('a rail station result centres the map on the station', async () => {
    state.search = [{ id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail', lat: 52.2288, lon: 21.0033 }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Centralna' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Warszawa Centralna, Stacja kolejowa PKP/ }))
    expect(await screen.findByRole('dialog', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(map().focus).toMatchObject({ lat: 52.2288, lon: 21.0033 })
  })

  it('result without coordinates shows „Brak pozycji na mapie” and a details link and does not move the camera', async () => {
    state.search = [{ id: '99999', name: 'Stacja Bez Pozycji', kind: 'rail', mode: 'rail' }]
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.change(field(), { target: { value: 'Bez Pozycji' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Stacja Bez Pozycji, / }))
    const notice = await screen.findByText(/Brak pozycji na mapie/)
    expect(notice).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Szczegóły stacji' })
    expect(link).toHaveAttribute('href', '/station/99999?name=Stacja%20Bez%20Pozycji')
    expect(map().focus).toBeNull()
    expect(map().selected).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('focus moves into the no-position notice (not body) when the picked row unmounts, and the search field is not refocused', async () => {
    state.search = [{ id: '99999', name: 'Stacja Bez Pozycji', kind: 'rail', mode: 'rail' }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Bez Pozycji' } })
    const row = await screen.findByRole('button', { name: /^Stacja Bez Pozycji, / })
    row.focus()
    fireEvent.click(row)
    // Komunikat nie ma `aria-label` (nazwą jest jego tekst — bez podwójnego odczytu), więc szukamy go po treści.
    await screen.findByText(/Brak pozycji na mapie/)
    const notice = screen.getAllByRole('status').find((el) => /Brak pozycji na mapie/.test(el.textContent ?? ''))!
    await waitFor(() => expect(notice).toHaveFocus())
    expect(within(notice).getByRole('link', { name: 'Szczegóły stacji' })).toBeInTheDocument()
    expect(field()).not.toHaveFocus()
  })

  it('a card pick still moves focus into the card (PanelFrame), not body', async () => {
    state.search = [{ id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail', lat: 52.2288, lon: 21.0033 }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Centralna' } })
    const row = await screen.findByRole('button', { name: /^Warszawa Centralna, Stacja kolejowa PKP/ })
    row.focus()
    fireEvent.click(row)
    await screen.findByRole('dialog', { name: 'Warszawa Centralna' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toHaveFocus())
  })

  it('a stop group with no members in the stop list and no coordinates shows the same notice', async () => {
    state.stops = { stops: [STOP], error: false }
    state.search = [{ id: '7777', name: 'Nieznany zespół', kind: 'transit', mode: 'bus' }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Nieznany' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Nieznany zespół, / }))
    expect(await screen.findByText(/Brak pozycji na mapie/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Szczegóły przystanku' })).toHaveAttribute('href', '/city/warszawa/stop/7777?name=Nieznany%20zesp%C3%B3%C5%82')
    expect(map().focus).toBeNull()
  })

  it('the no-position notice goes away with its close button and on the next pick', async () => {
    state.search = [{ id: '99999', name: 'Stacja Bez Pozycji', kind: 'rail', mode: 'rail' }]
    render(<CityMapPage />)
    fireEvent.change(field(), { target: { value: 'Bez Pozycji' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Stacja Bez Pozycji, / }))
    await screen.findByText(/Brak pozycji na mapie/)
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij komunikat' }))
    expect(screen.queryByText(/Brak pozycji na mapie/)).toBeNull()
  })
})

describe('CityMapPage — view, sharing, following', () => {
  it('starts from ?at=, else from the last view saved in this browser, else the city centre', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?at=52.25000,21.05000,15.0')
    const { unmount: unmountFirst } = render(<CityMapPage />)
    await waitFor(() => expect(map().initialCamera).toEqual({ lat: 52.25, lon: 21.05, zoom: 15 }))
    map().onViewChange({ center: { lat: 52.3, lon: 21.1 }, zoom: 13 })
    expect(window.location.search).toBe('?at=52.30000%2C21.10000%2C13.0')
    unmountFirst()

    window.history.replaceState(null, '', '/city/warszawa/map')
    const { unmount: unmountSecond } = render(<CityMapPage />)
    await waitFor(() => expect(map().initialCamera).toEqual({ lat: 52.3, lon: 21.1, zoom: 13 }))
    unmountSecond()

    window.localStorage.setItem('monitor.map.view.v1', '{broken')
    render(<CityMapPage />)
    await waitFor(() => expect(map().initialCamera).toEqual({ lat: 52.2297, lon: 21.0122, zoom: 12 }))
  })

  it('shares the current view link and confirms it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CityMapPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Udostępnij ten widok mapy' }))
    expect(await screen.findByText('Skopiowano link do tego widoku.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('follows a vehicle until the user drags the map', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Śledź pojazd' }))
    await waitFor(() => expect(map().follow).toMatchObject({ lat: 52.2, lon: 21.0 }))
    expect(screen.getByRole('button', { name: 'Śledzę pojazd' })).toHaveAttribute('aria-pressed', 'true')
    map().onUserMove()
    await waitFor(() => expect(map().follow).toBeNull())
  })
})

describe('CityMapPage — pinned items, nearby, list, disruptions', () => {
  it('rings Pulpit pinnedItems on the map, toggles the star and jumps from the menu', async () => {
    window.localStorage.setItem('monitor.favourites.v2', JSON.stringify([{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]))
    render(<CityMapPage />)
    await waitFor(() => expect(map().pinnedItems).toMatchObject([{ lat: 52.2288, lon: 21.0033 }]))

    fireEvent.click(screen.getByRole('button', { name: 'Przypięte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Warszawa Centralna' }))
    const card = await screen.findByRole('dialog', { name: 'Warszawa Centralna' })
    fireEvent.click(within(card).getByRole('button', { name: 'Odepnij ze Startu' }))
    await waitFor(() => expect(map().pinnedItems).toEqual([]))

    map().onSelect({ kind: 'stop', id: '100101' })
    const stopCard = await screen.findByRole('dialog', { name: 'Centrum 01' })
    fireEvent.click(within(stopCard).getByRole('button', { name: 'Przypnij do Startu' }))
    await waitFor(() => expect(map().pinnedItems).toMatchObject([{ lat: 52.23, lon: 21.01 }]))
    // Pin z mapy = jeden przystanek zespołu → przypięty z numerem (Pulpit pokaże „Centrum 01").
    expect(JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')).toEqual([
      { kind: 'gtfs', city: 'warszawa', id: '100101', name: 'Centrum 01', member: true },
    ])
  })

  it('opening a pinned zespół from the menu shows the group card with a filled star (not its first stop)', async () => {
    window.localStorage.setItem('monitor.favourites.v2', JSON.stringify([{ kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' }]))
    render(<CityMapPage />)
    await waitFor(() => expect(map().pinnedItems).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Przypięte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Centrum' }))
    const card = await screen.findByRole('dialog', { name: 'Centrum' })
    expect(within(card).getByRole('button', { name: 'Odepnij ze Startu' })).toBeInTheDocument()
  })

  it('opening a pinned single stop keeps the stop card (with its number) and a filled star', async () => {
    window.localStorage.setItem('monitor.favourites.v2', JSON.stringify([{ kind: 'gtfs', city: 'warszawa', id: '100101', name: 'Centrum 01', member: true }]))
    render(<CityMapPage />)
    await waitFor(() => expect(map().pinnedItems).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Przypięte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Centrum 01' }))
    const card = await screen.findByRole('dialog', { name: 'Centrum 01' })
    expect(within(card).getByRole('button', { name: 'Odepnij ze Startu' })).toBeInTheDocument()
  })

  it('right-click opens "nearby" with the closest places; a row opens its card', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onContextPoint({ lat: 52.2301, lon: 21.0101 })
    const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
    expect(map().selected).toEqual({ lat: 52.2301, lon: 21.0101 })
    fireEvent.click(within(panel).getByRole('button', { name: /Centrum/ }))
    expect(await screen.findByRole('dialog', { name: 'Centrum 01' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij kartę' }))
    expect(await screen.findByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
  })

  it('"Co jest w pobliżu?" in a place card is the keyboard path to the same panel', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'rail', id: '33605' })
    fireEvent.click(await screen.findByRole('button', { name: 'Co jest w pobliżu?' }))
    expect(await screen.findByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
  })

  it('"Lista" shows what is in view and opens a card from a row', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(map().listOpen).toBe(true)
    expect(await screen.findByText('Liczę obiekty w kadrze…')).toBeInTheDocument()
    map().onVisibleChange([{ kind: 'vehicle', id: 'v1', label: '20' }], false)
    fireEvent.click(await screen.findByRole('button', { name: /^Linia 20 → Centrum/ }))
    expect(await screen.findByRole('dialog', { name: 'tramwaj 20' })).toBeInTheDocument()
  })

  it('"only lines with disruptions" filters vehicles, persists in the URL and shows a chip', async () => {
    state.vehicles = { ...state.vehicles, alertLines: ['20'] }
    render(<CityMapPage />)
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tylko linie z utrudnieniami' }))
    await waitFor(() => expect([...(map().onlyLines ?? [])]).toEqual(['20']))
    expect(window.location.search).toBe('?alerts=1')
    fireEvent.click(screen.getByRole('button', { name: /nie tylko z utrudnieniami/ }))
    await waitFor(() => expect(map().onlyLines).toBeNull())
  })
})

describe('CityMapPage — toolbar and filters', () => {
  const FULL_URL = '/city/warszawa/map?at=52.25000%2C21.05000%2C15.0&hide=busStops%2Ctrams&line=20&dir=1&alerts=1'

  it('Lista and Filtry sit under the search field on a phone, with the mode chips of the vehicles present', async () => {
    setWide(false)
    render(<CityMapPage />)
    expect(screen.getByRole('button', { name: 'Lista' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filtry/ })).toHaveAttribute('aria-expanded', 'false')
    const chips = within(screen.getByRole('group', { name: 'Rodzaje pojazdów' })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['Tramwaje']) // VEHICLE to jedyny pojazd w danych
  })

  it('a mode chip hides and shows the layer through the same URL state as Filtry', async () => {
    setWide(false)
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Tramwaje' }))
    expect([...map().hidden]).toEqual(['trams'])
    expect(window.location.search).toBe('?hide=trams')
    expect(screen.getByRole('button', { name: 'Tramwaje' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^Filtry/ })).toHaveTextContent('1 aktywnych ograniczeń')

    fireEvent.click(screen.getByRole('button', { name: /^Filtry/ }))
    expect(screen.getByRole('checkbox', { name: /Tramwaje/ })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Tramwaje' }))
    expect([...map().hidden]).toEqual([])
    expect(window.location.search).toBe('')
  })

  it('Wyczyść filtry resets layers, line, dir, alerts, hide and keeps city', async () => {
    window.history.replaceState(null, '', FULL_URL)
    render(<CityMapPage />)
    await waitFor(() => expect(map().routeId).toBe('20'))
    expect(screen.getByRole('button', { name: /^Filtry/ })).toHaveTextContent('4 aktywnych ograniczeń') // 2 warstwy + linia + utrudnienia

    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    await waitFor(() => expect(map().routeId).toBeNull())
    expect([...map().hidden]).toEqual([])
    expect(map().onlyLines).toBeNull()
    expect(window.location.pathname).toBe('/city/warszawa/map')
    expect(window.location.search).toBe('?at=52.25000%2C21.05000%2C15.0')
    expect(screen.queryByRole('button', { name: 'Wyczyść filtry' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Aktywne filtry' })).toBeNull()
  })

  it('empty list after filter offers Wyczyść filtry, and clearing brings the view back', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?hide=trams')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    act(() => map().onVisibleChange([], false))
    const panel = await screen.findByRole('dialog', { name: 'W widoku' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Wyczyść filtry' }))
    await waitFor(() => expect([...map().hidden]).toEqual([]))
    expect(window.location.search).toBe('')
  })

  it('an empty list without any filter does not offer Wyczyść filtry', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    act(() => map().onVisibleChange([], false))
    const panel = await screen.findByRole('dialog', { name: 'W widoku' })
    expect(within(panel).queryByRole('button', { name: 'Wyczyść filtry' })).toBeNull()
  })
})

type GeoSuccess = (p: GeolocationPosition) => void
type GeoFailure = (e: GeolocationPositionError) => void

/** Atrapa `navigator.geolocation`: odpowiedź przychodzi dopiero z testu. */
function stubGeolocation() {
  const calls: { ok: GeoSuccess; fail: GeoFailure }[] = []
  const getCurrentPosition = vi.fn((ok: GeoSuccess, fail: GeoFailure) => {
    calls.push({ ok, fail })
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return { calls, getCurrentPosition }
}
const FIX = { coords: { latitude: 52.2301, longitude: 21.0101, accuracy: 30 } } as GeolocationPosition

/** Wypełnia provider pozycją, zanim zamontuje się strona (jak po „W pobliżu mnie” na Starcie). */
function Primer() {
  const { request, status } = useUserLocation()
  useEffect(() => void request(), [request])
  return <span data-testid="loc-status">{status}</span>
}

describe('CityMapPage — my location', () => {
  afterEach(() => Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }))

  it('map page makes no geolocation call on load', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('"Moja lokalizacja" opens nearby at the point and focuses it', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
    expect(within(panel).getByText(/w linii prostej/)).toBeInTheDocument()
    expect(map().selected).toEqual({ lat: 52.2301, lon: 21.0101 })
    expect((state.mapProps as unknown as { focus: unknown }).focus).toMatchObject({ lat: 52.2301, lon: 21.0101 })
  })

  it('on a phone, closing "W pobliżu" opened by "Moja lokalizacja" returns focus to the locate button', async () => {
    setWide(false)
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    const locate = screen.getByRole('button', { name: 'Moja lokalizacja' })
    locate.focus()
    fireEvent.click(locate)
    await act(async () => geo.calls[0].ok(FIX))
    const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Zamknij „W pobliżu”' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Arkusz przemontował się przy zmianie obiektu, więc to NOWY przycisk — i to on ma dostać fokus.
    expect(screen.getByRole('button', { name: 'Moja lokalizacja' })).toHaveFocus()
  })

  it('Escape closes "W pobliżu" opened by "Moja lokalizacja" and returns focus to the locate button (same path as ×)', async () => {
    setWide(false)
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    const locate = screen.getByRole('button', { name: 'Moja lokalizacja' })
    locate.focus()
    fireEvent.click(locate)
    await act(async () => geo.calls[0].ok(FIX))
    const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Moja lokalizacja' })).toHaveFocus()
  })

  it('nearby=1 with ready point opens nearby and removes the flag', async () => {
    const geo = stubGeolocation()
    const { rerender } = render(<Primer />)
    await waitFor(() => expect(geo.calls).toHaveLength(1))
    await act(async () => geo.calls[0].ok(FIX))
    await waitFor(() => expect(screen.getByTestId('loc-status')).toHaveTextContent('ready'))

    window.history.replaceState(null, '', '/city/warszawa/map?hide=busStops&nearby=1')
    rerender(<CityMapPage />)
    expect(await screen.findByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
    expect(map().selected).toEqual({ lat: 52.2301, lon: 21.0101 })
    expect(map().initialCamera).toEqual({ lat: 52.2301, lon: 21.0101, zoom: MAP_ZOOM.focus })
    expect(window.location.search).toBe('?hide=busStops')
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('nearby=1 with ready point survives React StrictMode (effects run twice)', async () => {
    const geo = stubGeolocation()
    const strict = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <UserLocationProvider>{children}</UserLocationProvider>
      </StrictMode>
    )
    const { rerender } = baseRender(<Primer />, { wrapper: strict })
    await waitFor(() => expect(geo.calls).toHaveLength(1))
    await act(async () => geo.calls[0].ok(FIX))
    await waitFor(() => expect(screen.getByTestId('loc-status')).toHaveTextContent('ready'))

    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    rerender(<CityMapPage />)
    expect(await screen.findByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
    expect(map().initialCamera).toEqual({ lat: 52.2301, lon: 21.0101, zoom: MAP_ZOOM.focus })
    expect(window.location.search).toBe('')
  })

  /** Wszystko, co przeglądarka zapamiętałaby o widoku: URL i każda wartość w localStorage. */
  const persistedText = () =>
    [window.location.href, ...Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k) ?? '')].join('\n')
  const AT_USER = { center: { lat: 52.2301, lon: 21.0101 }, zoom: 16 }

  it('the camera centred on the user is never written to the URL or localStorage, and writing resumes after a drag', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?at=52.23010%2C21.01010%2C15.0&hide=busStops')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })

    act(() => map().onViewChange(AT_USER))
    expect(persistedText()).not.toMatch(/52\.230|21\.010/)
    expect(window.location.search).toBe('?hide=busStops')

    act(() => map().onUserMove())
    act(() => map().onViewChange({ center: { lat: 52.3, lon: 21.1 }, zoom: 13 }))
    expect(window.location.search).toContain('at=52.30000')
    expect(window.localStorage.getItem('monitor.map.view.v1')).toContain('52.30000')
  })

  it('locatedViewRef is cleared when the camera is moved away programmatically (line select / follow) and still blocks saving while centred on the user', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    const userCoordinates = /52\.230|21\.010/

    // Lot do użytkownika: spóźnione `moveend` z przerwanej animacji (daleko) NIE odblokowuje zapisu — blokadę zdejmuje tylko
    // przeciągnięcie albo świadomy ruch programowy — więc dolot też nigdzie nie trafia.
    act(() => map().onViewChange(AT_USER))
    act(() => map().onViewChange({ center: { lat: 52.25, lon: 21.05 }, zoom: 14 }))
    act(() => map().onViewChange(AT_USER))
    expect(window.location.search).toBe('')
    expect(persistedText()).not.toMatch(userCoordinates)

    // Śledzenie pojazdu przenosi kamerę (bez przeciągnięcia) i zdejmuje blokadę: ten kadr jest zwykłym widokiem.
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Śledź pojazd' }))
    await waitFor(() => expect(map().follow).not.toBeNull())
    act(() => map().onViewChange({ center: { lat: 52.2, lon: 21.0 }, zoom: 16 }))
    expect(window.location.search).toContain('at=52.20000')
    expect(window.localStorage.getItem('monitor.map.view.v1')).toContain('52.20000')

    // Powrót w promień 150 px od użytkownika jest blokowany także po zdjęciu blokady.
    act(() => map().onViewChange({ ...AT_USER, zoom: 17 }))
    expect(window.location.search).toContain('at=52.20000')
    expect(persistedText()).not.toMatch(userCoordinates)
  })

  it('a route fit (line select) lifts the block: the fitted view is saved', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    act(() => map().onViewChange(AT_USER))
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Pokaż trasę na mapie' }))
    await waitFor(() => expect(map().route).not.toBeNull()) // „W pobliżu" zasłania panel linii, ale mapa już kadruje trasę
    act(() => map().onViewChange({ center: { lat: 52.28, lon: 20.99 }, zoom: 13 }))
    expect(window.location.search).toContain('at=52.28000')
    act(() => map().onViewChange({ ...AT_USER, zoom: 17 }))
    expect(window.location.search).toContain('at=52.28000')
    expect(persistedText()).not.toMatch(/52\.230|21\.010/)
  })

  // 1 m ≈ 1/111320°; przy z16 150 px ≈ 220 m, a zoom o jeden poziom wokół punktu 100–150 px od środka przesuwa środek o ~40–55 m.
  const northOfUser = (m: number) => ({ lat: 52.2301 + m / 111_320, lon: 21.0101 })

  it('wheel, pinch and keyboard zoom right after locating never persist a centre a few tens of metres from the user', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    for (const metres of [40, 55, 150]) act(() => map().onViewChange({ center: northOfUser(metres), zoom: 16 }))
    // Strzałki przesuwają kadr bez `dragstart`: nawet 1 km dalej nic nie jest zapisane, dopóki nie było przeciągnięcia.
    act(() => map().onViewChange({ center: northOfUser(1000), zoom: 16 }))
    expect(window.location.search).toBe('')
    expect(window.localStorage.getItem('monitor.map.view.v1')).toBeNull()
  })

  it('after a drag the block is only the 150 px radius: a padded centre (100 px off) stays unsaved, a real move away saves', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    act(() => map().onUserMove())
    act(() => map().onViewChange({ center: northOfUser(146), zoom: 16 })) // ~100 px od użytkownika
    act(() => map().onViewChange({ center: northOfUser(40), zoom: 16 }))
    expect(window.location.search).toBe('')
    act(() => map().onViewChange({ center: northOfUser(2000), zoom: 16 })) // ~1400 px
    expect(window.location.search).toContain('at=52.24')
    expect(persistedText()).not.toMatch(/52\.2301/) // sama długość geograficzna jest wspólna (przesunięcie na północ), szerokość nie
  })

  it('a city view that happens to lie within 150 px of the user is not persisted either (fails closed)', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż całe miasto — Warszawa' }))
    act(() => map().onViewChange({ center: { lat: 52.2297, lon: 21.0122 }, zoom: 12 }))
    expect(window.location.search).toBe('')
  })

  it('nearby=1 start view centred on the user is not persisted either', async () => {
    const geo = stubGeolocation()
    const { rerender } = render(<Primer />)
    await waitFor(() => expect(geo.calls).toHaveLength(1))
    await act(async () => geo.calls[0].ok(FIX))
    await waitFor(() => expect(screen.getByTestId('loc-status')).toHaveTextContent('ready'))
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    rerender(<CityMapPage />)
    await screen.findByRole('dialog', { name: 'W pobliżu' })

    act(() => map().onViewChange(AT_USER))
    expect(persistedText()).not.toMatch(/52\.230|21\.010/)

    act(() => map().onUserMove())
    act(() => map().onViewChange({ center: { lat: 52.3, lon: 21.1 }, zoom: 13 }))
    expect(window.location.search).toContain('at=52.30000')
  })

  it('"Pokaż całe miasto" after locating resumes saving the view', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    // Użytkownik na obrzeżach: centrum miasta leży daleko od jego pozycji (blisko niej zapis jest blokowany, test niżej).
    await act(async () => geo.calls[0].ok({ coords: { latitude: 52.4, longitude: 20.8, accuracy: 30 } } as GeolocationPosition))
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż całe miasto — Warszawa' }))
    act(() => map().onViewChange({ center: { lat: 52.2297, lon: 21.0122 }, zoom: 12 }))
    expect(window.location.search).toContain('at=52.22970')
  })

  it('the nearby=1 notice does not come back once nearby was opened and closed another way', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    render(<CityMapPage />)
    await screen.findByRole('button', { name: 'Pokaż moją lokalizację' })
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij „W pobliżu”' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'W pobliżu' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Pokaż moją lokalizację' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('nearby=1 without point shows „Pokaż moją lokalizację" and calls no GPS until clicked', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    render(<CityMapPage />)
    const show = await screen.findByRole('button', { name: 'Pokaż moją lokalizację' })
    expect(screen.queryByRole('dialog', { name: 'W pobliżu' })).toBeNull()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?nearby=1')

    fireEvent.click(show)
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    await act(async () => geo.calls[0].ok(FIX))
    expect(await screen.findByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pokaż moją lokalizację' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('a denied nearby=1 prompt consumes the flag and shows the denial text', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    render(<CityMapPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pokaż moją lokalizację' }))
    await act(async () => geo.calls[0].fail({ code: 1, message: 'x' } as GeolocationPositionError))
    expect(await screen.findByText('Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pokaż moją lokalizację' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('a position located elsewhere (provider, not this page) already keeps a view centred on the user out of the URL and storage', async () => {
    const geo = stubGeolocation()
    const { rerender } = render(<Primer />)
    await waitFor(() => expect(geo.calls).toHaveLength(1))
    await act(async () => geo.calls[0].ok(FIX))
    await waitFor(() => expect(screen.getByTestId('loc-status')).toHaveTextContent('ready'))
    rerender(<CityMapPage />) // bez `?nearby=1` i bez kliknięcia „Moja lokalizacja" na tej stronie
    await waitFor(() => expect(state.mapProps).not.toBeNull())

    act(() => map().onViewChange(AT_USER))
    expect(persistedText()).not.toMatch(/52\.230|21\.010/)
    act(() => map().onViewChange({ center: { lat: 52.3, lon: 21.1 }, zoom: 13 }))
    expect(window.location.search).toContain('at=52.30000')
  })

  describe('picking a stop in "W pobliżu"', () => {
    const FAR_STOP = { id: '100201', groupId: '1002', name: 'Dworzec', code: '01', lat: 52.233, lon: 21.0101, mode: 'bus' } // ~330 m od FIX, poza promieniem 150 px przy z16

    it('opened from the GPS point keeps the view blocked (the fly-to ends far from the user but is still derived from them); a drag lifts it', async () => {
      const geo = stubGeolocation()
      state.stops = { stops: [STOP, FAR_STOP], error: false }
      render(<CityMapPage />)
      await waitFor(() => expect(state.mapProps).not.toBeNull())
      fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
      await act(async () => geo.calls[0].ok(FIX))
      const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
      fireEvent.click(within(panel).getByRole('button', { name: /Dworzec/ }))
      await screen.findByRole('dialog', { name: 'Dworzec 01' })

      act(() => map().onViewChange({ center: { lat: 52.233, lon: 21.0101 }, zoom: 16 }))
      expect(window.location.search).toBe('')
      expect(persistedText()).not.toMatch(/52\.233/)

      act(() => map().onUserMove())
      act(() => map().onViewChange({ center: { lat: 52.233, lon: 21.0101 }, zoom: 16 }))
      expect(window.location.search).toContain('at=52.23300')
    })

    it('opened from a point picked on the map (no GPS) is a normal focus and is saved', async () => {
      const geo = stubGeolocation()
      state.stops = { stops: [STOP, FAR_STOP], error: false }
      render(<CityMapPage />)
      await waitFor(() => expect(state.mapProps).not.toBeNull())
      fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
      await act(async () => geo.calls[0].ok(FIX))
      await screen.findByRole('dialog', { name: 'W pobliżu' })
      act(() => map().onContextPoint({ lat: 52.2325, lon: 21.0101 })) // długie przytrzymanie: okolica z punktu na mapie, nie z GPS
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'W pobliżu' })).getByRole('button', { name: /Dworzec/ }))
      await screen.findByRole('dialog', { name: 'Dworzec 01' })
      act(() => map().onViewChange({ center: { lat: 52.233, lon: 21.0101 }, zoom: 16 }))
      expect(window.location.search).toContain('at=52.23300')
    })
  })

  it('the departure preview of "W pobliżu" is requested for a point picked on the map but never for the GPS point (stop ids would reveal the position)', async () => {
    const geo = stubGeolocation()
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    act(() => map().onContextPoint({ lat: 52.2301, lon: 21.0101 }))
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    expect(state.boardCalls.at(-1)).toEqual(['warszawa', ['100101'], 1])

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij „W pobliżu”' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'W pobliżu' })).toBeNull())
    state.boardCalls = []
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].ok(FIX))
    const panel = await screen.findByRole('dialog', { name: 'W pobliżu' })
    expect(within(panel).getByRole('button', { name: /Centrum 01/ })).toBeInTheDocument() // wiersze zostają
    expect(state.boardCalls.length).toBeGreaterThan(0)
    expect(state.boardCalls.every(([cityArg, ids]) => cityArg === null && (ids as string[]).length === 0)).toBe(true)
  })

  it('the nearby=1 notice goes away when the locate button is denied, and the flag is consumed', async () => {
    const geo = stubGeolocation()
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    render(<CityMapPage />)
    await screen.findByRole('button', { name: 'Pokaż moją lokalizację' })
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    await act(async () => geo.calls[0].fail({ code: 1, message: 'x' } as GeolocationPositionError))
    expect(await screen.findByText('Brak dostępu do lokalizacji. Wyszukaj miejsce lub wybierz je na mapie')).toBeInTheDocument()
    expect(screen.queryByText('Okolica wymaga Twojej lokalizacji.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pokaż moją lokalizację' })).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('a position that arrives after the user left the page does not touch the new page URL', async () => {
    const geo = stubGeolocation()
    const { unmount } = render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }))
    unmount()
    window.history.replaceState(null, '', '/city/warszawa/lines?at=52.10000%2C21.10000%2C14.0&nearby=1')
    await act(async () => geo.calls[0].ok(FIX))
    expect(window.location.search).toBe('?at=52.10000%2C21.10000%2C14.0&nearby=1')
  })

  it('closing nearby keeps hidden/line filters', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?hide=busStops&line=20')
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onContextPoint({ lat: 52.2301, lon: 21.0101 })
    await screen.findByRole('dialog', { name: 'W pobliżu' })
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij „W pobliżu”' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'W pobliżu' })).toBeNull())
    expect(window.location.search).toBe('?hide=busStops&line=20')
    expect([...map().hidden]).toEqual(['busStops'])
    expect(map().routeId).toBe('20')
  })
})

describe('CityMapPage — city reset and announcements', () => {
  it('"Pokaż całe miasto" looks like the other map controls (glass-chrome with border and shadow, as „Moja lokalizacja")', async () => {
    render(<CityMapPage />)
    const button = screen.getByRole('button', { name: 'Pokaż całe miasto — Warszawa' })
    expect(button).toHaveClass('glass-chrome', 'border', 'border-surface-border', 'shadow-md')
    expect(button).not.toHaveClass('glass')
  })

  it('"Pokaż całe miasto" flies back to the city centre at the start zoom', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż całe miasto — Warszawa' }))
    await waitFor(() => expect((state.mapProps as unknown as { focus: unknown }).focus).toMatchObject({ lat: 52.2297, lon: 21.0122, zoom: 12 }))
  })

  it('announces the vehicle count for screen readers when filters change, not on every reading', async () => {
    state.vehicles.lastSuccessAt = Date.now()
    render(<CityMapPage />)
    expect(screen.getByText('Na mapie 1 pojazd')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Tramwaje/ }))
    expect(await screen.findByText('Na mapie 0 pojazdów')).toBeInTheDocument()
  })

  it('stays silent until the first successful load: unknown is not announced as 0', () => {
    state.vehicles = { vehicles: [], feed: { state: 'loading', ageMs: null }, alertLines: [], error: null, lastSuccessAt: null }
    const { container, rerender } = render(<CityMapPage />)
    // Żywy region bez roli i bez tekstu: jedyny sposób to selektor.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const region = () => container.querySelector('p.sr-only[aria-live="polite"]')
    expect(region()).toBeEmptyDOMElement()
    state.vehicles = { vehicles: [], feed: { state: 'failed', ageMs: null }, alertLines: [], error: 'x', lastSuccessAt: null }
    rerender(<CityMapPage />)
    expect(region()).toBeEmptyDOMElement()
    // Po udanym, ale pustym odczycie (noc) zero jest znane.
    state.vehicles = { vehicles: [], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null, lastSuccessAt: Date.now() }
    rerender(<CityMapPage />)
    expect(region()).toHaveTextContent('Na mapie 0 pojazdów')
  })

  it('declines „pojazd" by the count (1 pojazd, 2 pojazdy, 5 pojazdów)', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...VEHICLE, id: `v${i}` }))
    state.vehicles = { vehicles: many(2), feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null, lastSuccessAt: Date.now() }
    const { unmount } = render(<CityMapPage />)
    expect(screen.getByText('Na mapie 2 pojazdy')).toBeInTheDocument()
    unmount()
    state.vehicles = { vehicles: many(5), feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null, lastSuccessAt: Date.now() }
    render(<CityMapPage />)
    expect(screen.getByText('Na mapie 5 pojazdów')).toBeInTheDocument()
  })
})
