// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { CityVehicleMap } from './CityVehicleMap'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { RailStationPin } from '@/lib/board/railStationPin'

type PopupMock = { setLngLat: (l: unknown) => PopupMock; setDOMContent: (node: HTMLElement) => PopupMock; addTo: () => PopupMock; content: HTMLElement | null }

let sourceAdded = false
let layerAdded = false
const sourceMock = { setData: vi.fn() }
const handlers = new Map<string, (e: unknown) => void>()

vi.mock('maplibre-gl', () => {
  const map = {
    remove: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    getSource: vi.fn(() => (sourceAdded ? sourceMock : undefined)),
    addSource: vi.fn(() => {
      sourceAdded = true
    }),
    addLayer: vi.fn(() => {
      layerAdded = true
    }),
    // Warstwa istnieje dopiero po `addLayer()` -- tak jak prawdziwe MapLibre,
    // żeby test przełącznika widoczności (Fix 1) łapał ewentualny brak guardu.
    getLayer: vi.fn(() => (layerAdded ? {} : undefined)),
    setLayoutProperty: vi.fn(),
    on: vi.fn((event: string, layerOrHandler: string | ((e: unknown) => void), handler?: (e: unknown) => void) => {
      if (typeof layerOrHandler === 'string' && handler !== undefined) handlers.set(`${event}:${layerOrHandler}`, handler)
    }),
    getCanvas: vi.fn(() => ({ style: {} })),
  }
  return {
    setWorkerUrl: vi.fn(),
    Map: vi.fn(function Map() {
      return map
    }),
    Popup: vi.fn(function Popup() {
      const p: PopupMock = {
        content: null,
        setLngLat: () => p,
        setDOMContent: (node) => ((p.content = node), p),
        addTo: () => p,
      }
      return p
    }),
    LngLatBounds: vi.fn(function LngLatBounds() {
      return { extend: vi.fn() }
    }),
    // Instancja ŚWIEŻA na każde wywołanie `new Marker()` (z własnym elementem
    // DOM i popupem) — nie jeden dzielony singleton. Task 2 wymaga sprawdzenia,
    // że AKTUALIZACJA istniejącego markera zmienia kolor jego WŁASNEGO elementu;
    // dzielony singleton maskowałby regresję (test przechodziłby, nawet gdyby
    // `syncRailMarkers` nigdy nie odświeżał stylu przy update).
    Marker: vi.fn(function Marker() {
      const element = document.createElement('div')
      const popup = { setDOMContent: vi.fn() }
      return {
        element,
        setLngLat: vi.fn().mockReturnThis(),
        setPopup: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getPopup: vi.fn(() => popup),
        getElement: vi.fn(() => element),
      }
    }),
  }
})

function vehicle(overrides: Partial<CityVehicle> = {}): CityVehicle {
  return {
    id: 'v1',
    lat: 52.2,
    lon: 21.0,
    bearing: null,
    sideNumber: '1234',
    ageSec: 5,
    headsign: 'Centrum',
    routeId: '20',
    shortName: '20',
    mode: 'tram',
    color: '#009944',
    ...overrides,
  }
}

describe('CityVehicleMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceAdded = false
    layerAdded = false
    handlers.clear()
  })

  it('wystawia dostępny region nawet bez pojazdów — nie inicjalizuje mapy', () => {
    render(<CityVehicleMap vehicles={[]} city="warszawa" ariaLabel="Mapa miasta" />)
    expect(screen.getByRole('region', { name: 'Mapa miasta' })).toBeInTheDocument()
    expect(maplibregl.Map).not.toHaveBeenCalled()
  })

  it('montuje mapę raz i dodaje warstwę GeoJSON pojazdów przy pierwszej niepustej liście', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    const mapInstance = vi.mocked(maplibregl.Map).mock.results[0].value
    await waitFor(() => expect(mapInstance.addSource).toHaveBeenCalledTimes(1))
    const [, sourceOptions] = mapInstance.addSource.mock.calls[0]
    expect(sourceOptions.data.features).toHaveLength(1)
    expect(sourceOptions.data.features[0].properties).toEqual({ id: 'v1', color: '#009944', opacity: 1 })
  })

  // Regresja: `?vehicles=0` w URL-u dawał `vehicles={[]}` od pierwszego
  // renderu -- montowanie (deps `[]`) miało tylko jedną szansę i nigdy więcej
  // się nie odpalało, mapa zostawała pusta na zawsze. `vehicles` musi więc
  // zostać pełną listą niezależnie od `vehiclesVisible`; widoczność idzie
  // wyłącznie przez layout warstwy.
  it('montuje mapę i tworzy warstwę nawet gdy vehiclesVisible=false, z warstwą początkowo ukrytą', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} vehiclesVisible={false} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    const mapInstance = vi.mocked(maplibregl.Map).mock.results[0].value
    await waitFor(() => expect(mapInstance.addLayer).toHaveBeenCalledTimes(1))
    const [layerOptions] = mapInstance.addLayer.mock.calls[0]
    expect(layerOptions.layout).toEqual({ visibility: 'none' })
  })

  it('przełączenie vehiclesVisible po zamontowaniu woła setLayoutProperty, bez przemontowania mapy', async () => {
    const { rerender } = render(<CityVehicleMap vehicles={[vehicle()]} vehiclesVisible={true} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const mapInstance = vi.mocked(maplibregl.Map).mock.results[0].value
    await waitFor(() => expect(mapInstance.addLayer).toHaveBeenCalledTimes(1))

    rerender(<CityVehicleMap vehicles={[vehicle()]} vehiclesVisible={false} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(mapInstance.setLayoutProperty).toHaveBeenCalledWith('city-vehicles-circles', 'visibility', 'none'))
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)

    rerender(<CityVehicleMap vehicles={[vehicle()]} vehiclesVisible={true} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(mapInstance.setLayoutProperty).toHaveBeenCalledWith('city-vehicles-circles', 'visibility', 'visible'))
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
  })

  it('aktualizuje dane przez setData bez przemontowania mapy przy kolejnym pollu', async () => {
    const { rerender } = render(<CityVehicleMap vehicles={[vehicle()]} city="warszawa" ariaLabel="Mapa miasta" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sourceAdded).toBe(true))

    rerender(<CityVehicleMap vehicles={[vehicle({ lat: 52.21 })]} city="warszawa" ariaLabel="Mapa miasta" />)

    await waitFor(() => expect(sourceMock.setData).toHaveBeenCalledTimes(1))
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    expect(sourceMock.setData.mock.calls[0][0].features[0].geometry.coordinates).toEqual([21.0, 52.21])
  })

  it('pojazd starszy niż 180 s znika z warstwy', async () => {
    render(<CityVehicleMap vehicles={[vehicle({ id: 'stary', ageSec: 200 }), vehicle({ id: 'swiezy', ageSec: 10 })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const mapInstance = vi.mocked(maplibregl.Map).mock.results[0].value
    await waitFor(() => expect(mapInstance.addSource).toHaveBeenCalledTimes(1))
    const ids = mapInstance.addSource.mock.calls[0][1].data.features.map((f: { properties: { id: string } }) => f.properties.id)
    expect(ids).toEqual(['swiezy'])
  })

  it('pojazd bez znanej linii dostaje szary kolor', async () => {
    render(<CityVehicleMap vehicles={[vehicle({ routeId: null, shortName: null, mode: null, color: null })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const mapInstance = vi.mocked(maplibregl.Map).mock.results[0].value
    await waitFor(() => expect(mapInstance.addSource).toHaveBeenCalledTimes(1))
    expect(mapInstance.addSource.mock.calls[0][1].data.features[0].properties.color).toBe('#9ca3af')
  })

  it('klik warstwy z pojazdem na znanej linii otwiera popup z linią, kierunkiem i linkiem', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(handlers.has('click:city-vehicles-circles')).toBe(true))

    const click = handlers.get('click:city-vehicles-circles')!
    click({ features: [{ properties: { id: 'v1' } }], lngLat: { lng: 21.0, lat: 52.2 } })

    const popup = vi.mocked(maplibregl.Popup).mock.results.at(-1)!.value as PopupMock
    const content = popup.content!
    expect(content.textContent).toContain('20')
    expect(content.textContent).toContain('Centrum')
    expect(content.textContent).toContain('1234')
    // eslint-disable-next-line testing-library/no-node-access -- popup poza drzewem RTL, jak w MapView.test.tsx
    const link = content.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/city/warszawa/line/20')
  })

  it('klik warstwy z pojazdem bez znanej linii pokazuje komunikat, bez linku', async () => {
    render(<CityVehicleMap vehicles={[vehicle({ id: 'szary', routeId: null, shortName: null, mode: null, color: null })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(handlers.has('click:city-vehicles-circles')).toBe(true))

    const click = handlers.get('click:city-vehicles-circles')!
    click({ features: [{ properties: { id: 'szary' } }], lngLat: { lng: 21.0, lat: 52.2 } })

    const popup = vi.mocked(maplibregl.Popup).mock.results.at(-1)!.value as PopupMock
    const content = popup.content!
    expect(content.textContent).toContain('Brak przypisania do linii')
    // eslint-disable-next-line testing-library/no-node-access -- jak wyżej
    expect(content.querySelector('a')).toBeNull()
  })

  function railStation(overrides: Partial<RailStationPin> = {}): RailStationPin {
    return {
      id: '33605',
      lat: 52.2288207,
      lon: 21.00316,
      label: 'Warszawa Centralna',
      mode: 'rail',
      href: '/station/33605',
      preview: ['18:12 → Kutno (+6 min)'],
      status: 'delayed',
      coordSource: 'station',
      ...overrides,
    }
  }

  it('dodaje marker dla stacji kolei obok warstwy pojazdów pojazdów', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} railStations={[railStation()]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1))
  })

  // Kolor markera wg statusu jest już przetestowany jako czysta funkcja
  // (`railMarkerBackground`, Task 6) — tutaj sprawdzamy tylko wizualną
  // adnotację `city-fallback` (longhand `outlineStyle`, bezpieczne w jsdom).
  it('stacja city-fallback dostaje wizualną adnotację przybliżonej pozycji', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} railStations={[railStation({ coordSource: 'city-fallback' })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1))
    const element = vi.mocked(maplibregl.Marker).mock.calls[0][0]?.element as HTMLElement
    expect(element.style.outlineStyle).toBe('dashed')
  })

  it('aktualizuje piny stacji, gdy zmienia się status, bez przemontowania mapy', async () => {
    const { rerender } = render(<CityVehicleMap vehicles={[vehicle()]} railStations={[railStation({ status: 'onTime' })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1))
    rerender(<CityVehicleMap vehicles={[vehicle()]} railStations={[railStation({ status: 'delayed' })]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1)) // wciąż jeden Marker — update w miejscu, nie nowy
    expect(vi.mocked(maplibregl.Map)).toHaveBeenCalledTimes(1) // mapa się nie przemontowała
  })

  // Regresja: update-ścieżka w `syncRailMarkers` odświeżała TYLKO popup, nigdy
  // kolor/obrys elementu DOM istniejącego markera -- licznik `Marker`
  // wywołań (test wyżej) przechodził mimo błędu, bo błąd nie dotyczy LICZBY
  // markerów, tylko ich STYLU po aktualizacji. Marker mock musi zwracać
  // ŚWIEŻY element na `new Marker()`, żeby to w ogóle dało się zaobserwować
  // (patrz komentarz przy mocku `Marker` u góry pliku).
  it('odświeża kolor i obrys ISTNIEJĄCEGO markera stacji, gdy zmienia się status/coordSource', async () => {
    const { rerender } = render(
      <CityVehicleMap vehicles={[vehicle()]} railStations={[railStation({ status: 'onTime', coordSource: 'station' })]} city="warszawa" ariaLabel="Mapa" />
    )
    await waitFor(() => expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1))
    const element = vi.mocked(maplibregl.Marker).mock.results[0].value.element as HTMLElement
    const onTimeBackground = element.style.background
    expect(element.style.outlineStyle).toBe('')

    rerender(
      <CityVehicleMap
        vehicles={[vehicle()]}
        railStations={[railStation({ status: 'delayed', coordSource: 'city-fallback' })]}
        city="warszawa"
        ariaLabel="Mapa"
      />
    )
    await waitFor(() => expect(element.style.background).not.toBe(onTimeBackground))
    expect(vi.mocked(maplibregl.Marker)).toHaveBeenCalledTimes(1) // wciąż ten sam element, nie nowy marker
    expect(element.style.outlineStyle).toBe('dashed') // obrys city-fallback też się odświeżył na istniejącym elemencie
  })

  it('kamera początkowa obejmuje też pozycje stacji kolei, nie tylko pojazdy', async () => {
    render(<CityVehicleMap vehicles={[vehicle()]} railStations={[railStation()]} city="warszawa" ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    const bounds = vi.mocked(maplibregl.Map).mock.calls[0][0].bounds as unknown as { extend: ReturnType<typeof vi.fn> }
    expect(bounds.extend).toHaveBeenCalledWith([21.0, 52.2])
    expect(bounds.extend).toHaveBeenCalledWith([21.00316, 52.2288207])
  })

  it('kadr początkowy rezerwuje u góry zmierzoną wysokość paska sterowania leżącego na mapie', async () => {
    const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top }) as DOMRect
    const toolbar = document.createElement('div')
    toolbar.getBoundingClientRect = () => box(216, 376) // pasek złożony w kolumnę na telefonie
    const containerBox = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box(200, 800)) // kontener mapy
    render(<CityVehicleMap vehicles={[vehicle()]} city="warszawa" ariaLabel="Mapa" topOverlayRef={{ current: toolbar }} />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    const { padding } = vi.mocked(maplibregl.Map).mock.calls[0][0].fitBoundsOptions as { padding: Record<string, number> }
    expect(padding).toEqual({ top: 176 + 40, right: 40, bottom: 40, left: 40 })
    containerBox.mockRestore()
  })
})
