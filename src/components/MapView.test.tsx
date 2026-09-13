// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import type { MapPin } from './MapView'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { MapView } from './MapView'

const markerEl = document.createElement('div')

vi.mock('maplibre-gl', () => {
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    getElement: vi.fn(() => markerEl),
    remove: vi.fn(),
  }
  const map = { fitBounds: vi.fn(), remove: vi.fn() }
  // Funkcje zwykłe, nie strzałkowe — `new` na mocku strzałkowym rzuca „not a constructor".
  return {
    Map: vi.fn(function Map() {
      return map
    }),
    Marker: vi.fn(function Marker() {
      return marker
    }),
    Popup: vi.fn(function Popup() {
      return { setText: vi.fn().mockReturnThis() }
    }),
    LngLatBounds: vi.fn(function LngLatBounds() {
      return { extend: vi.fn() }
    }),
  }
})

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nic, gdy brak pinów — nie inicjalizuje mapy', () => {
    const { container } = render(<MapView pins={[]} ariaLabel="Mapa" />)
    expect(container).toBeEmptyDOMElement()
    expect(maplibregl.Map).not.toHaveBeenCalled()
  })

  it('wystawia dostępny region dla czytnika ekranu, gdy są piny', () => {
    render(<MapView pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]} ariaLabel="Mapa przystanku Foo" />)
    expect(screen.getByRole('region', { name: 'Mapa przystanku Foo' })).toBeInTheDocument()
  })

  it('tworzy jeden marker na pin i wyśrodkowuje na pierwszym', async () => {
    render(
      <MapView
        pins={[
          { id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' },
          { id: 'b', lat: 52.2, lon: 21.1, label: 'Słupek B' },
        ]}
        ariaLabel="Mapa"
      />
    )

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    const mapCall = vi.mocked(maplibregl.Map).mock.calls[0][0]
    expect(mapCall.center).toEqual([21.0, 52.1])
  })

  it('klik na pin woła onPinClick z jego id', async () => {
    const onPinClick = vi.fn()
    render(<MapView pins={[{ id: 'slupek-1', lat: 52.1, lon: 21.0, label: 'Słupek 1' }]} onPinClick={onPinClick} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    markerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onPinClick).toHaveBeenCalledWith('slupek-1')
  })

  it('nie przeinicjalizowuje mapy, gdy `pins` to nowa referencja o tej samej treści (poller tablicy odświeża co ~30s)', async () => {
    const pinsA: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]
    const { rerender } = render(<MapView pins={pinsA} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    // Nowa tablica, identyczna treść -- tak jak po kolejnym pollu w TransitStopDetail/StationAside.
    const pinsB: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]
    rerender(<MapView pins={pinsB} ariaLabel="Mapa" />)

    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    expect(vi.mocked(maplibregl.Map).mock.results[0]?.value.remove).not.toHaveBeenCalled()
  })
})
