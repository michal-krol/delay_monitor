// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityMapPage from './page'
import type { MapHit, MapView } from '@/components/map/TransitMap'
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
  vehicles: { vehicles: [] as unknown[], feed: { state: 'ready', ageMs: 13_000 as number | null }, error: null as string | null },
  stops: { stops: null as unknown[] | null, error: false },
  rail: { stations: null as unknown[] | null, error: false },
  mapProps: null as null | { routeId: string | null; hidden: Set<string>; selected: unknown; onSelect: (hit: MapHit | null) => void; onViewChange: (view: MapView) => void },
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
  routeId: '20', shortName: '20', mode: 'tram', color: null, directionId: 0, nextStop: { name: 'Rondo ONZ', groupId: '7002' },
}
const STOP = { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' }
const STATION = { id: '33605', name: 'Warszawa Centralna', lat: 52.2288, lon: 21.0033, tier: 1 }

function setWide(wide: boolean): void {
  // Zwykłe przypisanie, nie `vi.stubGlobal` — odmontowanie po teście (sprzątanie RTL) woła je
  // już PO `unstubAllGlobals`; jsdom nie ma własnego `matchMedia`.
  window.matchMedia = (() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  cityParam = 'warszawa'
  window.history.replaceState(null, '', '/city/warszawa/map')
  state.vehicles = { vehicles: [VEHICLE], feed: { state: 'ready', ageMs: 13_000 }, error: null }
  state.stops = { stops: [STOP], error: false }
  state.rail = { stations: [STATION], error: false }
  state.mapProps = null
  setWide(true)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cities')) return jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })
      if (url.startsWith('/api/gtfs/lines')) {
        return jsonResponse({ lines: { tram: [{ routeId: '20', line: '20', longName: 'Boernerowo — Żerań', color: null, textColor: '#ffffff', mode: 'tram', kind: 'regular' }] } })
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

  it('shows the freshness of vehicle positions in the header, in three distinct states', () => {
    const { rerender } = render(<CityMapPage />)
    expect(screen.getByText('Warszawa · pozycje pojazdów: 13 s temu')).toBeInTheDocument()
    state.vehicles = { vehicles: [], feed: { state: 'loading', ageMs: null }, error: null }
    rerender(<CityMapPage />)
    expect(screen.getByText(/wczytuję pozycje pojazdów/)).toBeInTheDocument()
    state.vehicles = { vehicles: [], feed: { state: 'failed', ageMs: null }, error: 'x' }
    rerender(<CityMapPage />)
    expect(screen.getByText(/nie udało się pobrać pozycji pojazdów/)).toBeInTheDocument()
    state.vehicles = { vehicles: [VEHICLE], feed: { state: 'failed', ageMs: 400_000 }, error: null }
    rerender(<CityMapPage />)
    expect(screen.getByText(/pokazujemy ostatnie dostępne/)).toBeInTheDocument()
  })

  it('restores filters and the line from the URL, shows them as removable chips', async () => {
    window.history.replaceState(null, '', '/city/warszawa/map?hide=busStops&line=20')
    render(<CityMapPage />)
    expect(await screen.findByText('Linia 20')).toBeInTheDocument()
    expect(screen.getByText('Ukryte: przystanki autobusowe')).toBeInTheDocument()
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
    expect(await screen.findByRole('dialog', { name: 'Centrum' })).toBeInTheDocument()

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
    state.vehicles = { vehicles: [{ ...VEHICLE, ageSec: 500 }], feed: { state: 'ready', ageMs: 1000 }, error: null }
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
