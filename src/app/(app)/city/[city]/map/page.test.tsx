// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityMapPage from './page'
import type { MapHit, MapView } from '@/components/map/TransitMap'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

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
  vehicles: { vehicles: [] as unknown[], feed: { state: 'ready', ageMs: 13_000 as number | null }, alertLines: [] as string[], error: null as string | null },
  stops: { stops: null as unknown[] | null, error: false },
  rail: { stations: null as unknown[] | null, error: false },
  mapProps: null as null | {
    initialCamera: { lat: number; lon: number; zoom: number }
    follow: { lat: number; lon: number } | null
    onUserMove: () => void
    onContextPoint: (point: { lat: number; lon: number }) => void
    onVisibleChange: (items: { kind: 'vehicle' | 'stop' | 'rail'; id: string; label: string }[], overflow: boolean) => void
    pinnedItems: { lat: number; lon: number }[]
    onlyLines: Set<string> | null
    listOpen: boolean
    route: { key: string } | null
    routeId: string | null; hidden: Set<string>; selected: unknown; onSelect: (hit: MapHit | null) => void; onViewChange: (view: MapView) => void },
}))
vi.mock('@/hooks/useCityVehicles', () => ({ useCityVehicles: () => state.vehicles }))
vi.mock('@/hooks/useCityStops', () => ({ useCityStops: () => state.stops }))
vi.mock('@/hooks/useRailStations', () => ({
  useRailStations: () => state.rail,
  useRailStationStatus: () => ({ status: null, error: false }),
}))
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: () => ({ data: null, error: null }) }))
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
  setWide(true)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cities')) return jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })
      if (url.startsWith('/api/gtfs/backbone')) return jsonResponse({ lines: [] })
      if (url.startsWith('/api/gtfs/line?')) return jsonResponse({ schedule: { state: 'ready' }, line: LINE_DETAIL })
      if (url.startsWith('/api/gtfs/lines')) {
        return jsonResponse({ lines: { tram: [{ routeId: '20', line: '20', longName: 'Boernerowo — Żerań', mode: 'tram', kind: 'regular' }] } })
      }
      return jsonResponse({ stations: [] })
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

const map = () => state.mapProps!

describe('CityMapPage', () => {
  it('404s for a city outside the registry', () => {
    cityParam = 'atlantyda'
    expect(() => render(<CityMapPage />)).toThrow('NEXT_NOT_FOUND')
  })

  it('has no city picker while the registry holds a single city', async () => {
    render(<CityMapPage />)
    await screen.findByText('Warszawa · pozycje pojazdów: 13 s temu')
    expect(screen.queryByRole('combobox', { name: 'Miasto' })).not.toBeInTheDocument()
  })

  it('shows the freshness of vehicle positions in the header, in three distinct states', () => {
    const { rerender } = render(<CityMapPage />)
    expect(screen.getByText('Warszawa · pozycje pojazdów: 13 s temu')).toBeInTheDocument()
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

  it('says a selected vehicle vanished rather than showing an empty card', async () => {
    const { rerender } = render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    await screen.findByRole('dialog')
    state.vehicles = { vehicles: [{ ...VEHICLE, ageSec: 500 }], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
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

  it('on a phone: search tabs switch between place and line search; the card is a bottom sheet', async () => {
    setWide(false)
    render(<CityMapPage />)
    expect(screen.getByRole('combobox', { name: 'Szukaj stacji lub przystanku…' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Linia' }))
    expect(screen.getByRole('combobox', { name: 'Szukaj linii' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Szukaj stacji lub przystanku…' })).toBeNull()

    await waitFor(() => expect(state.mapProps).not.toBeNull())
    map().onSelect({ kind: 'rail', id: '33605' })
    expect(await screen.findByRole('dialog', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Wybrany obiekt' })).toBeNull()
  })
})

describe('CityMapPage — line mode', () => {
  it('shows the line panel with the route, switches direction into the URL, opens a stop, exits with ×', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?line=20')
    render(<CityMapPage />)
    const panel = await screen.findByRole('dialog', { name: 'Linia 20' })
    expect(await within(panel).findByText('Boernerowo Żerań')).toBeInTheDocument()
    expect(within(panel).getByRole('img', { name: 'do' })).toBeInTheDocument()
    expect(within(panel).getByText(/w trasie: 1/)).toBeInTheDocument()
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

  it('"Pokaż trasę" in a vehicle card enters line mode in the vehicle direction', async () => {
    state.vehicles = { vehicles: [{ ...VEHICLE, directionId: 1 }], feed: { state: 'ready', ageMs: 1000 }, alertLines: [], error: null }
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    await screen.findByPlaceholderText('Szukaj linii…')
    map().onSelect({ kind: 'vehicle', id: 'v1' })
    fireEvent.click(await screen.findByRole('button', { name: 'Pokaż trasę na mapie' }))
    expect(await screen.findByRole('dialog', { name: 'Linia 20' })).toBeInTheDocument()
    expect(window.location.search).toBe('?line=20&dir=1')
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
    fireEvent.click(await screen.findByRole('button', { name: 'Linia 20 → Centrum' }))
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

describe('CityMapPage — city reset and announcements', () => {
  it('"Pokaż całe miasto" flies back to the city centre at the start zoom', async () => {
    render(<CityMapPage />)
    await waitFor(() => expect(state.mapProps).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż całe miasto — Warszawa' }))
    await waitFor(() => expect((state.mapProps as unknown as { focus: unknown }).focus).toMatchObject({ lat: 52.2297, lon: 21.0122, zoom: 12 }))
  })

  it('announces the vehicle count for screen readers when filters change, not on every reading', async () => {
    render(<CityMapPage />)
    expect(screen.getByText('Na mapie 1 pojazdów')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Tramwaje/ }))
    expect(await screen.findByText('Na mapie 0 pojazdów')).toBeInTheDocument()
  })
})
