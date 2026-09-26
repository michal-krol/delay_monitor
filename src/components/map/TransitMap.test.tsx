// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { TransitMap, type MapHit } from './TransitMap'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { LayerKey } from './mapData'

const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
const layers = new Set<string>()
const handlers = new Map<string, (e: unknown) => void>()
let rendered: { layer: { id: string }; properties: { id: string } }[] = []

vi.mock('maplibre-gl', () => {
  const map = {
    remove: vi.fn(),
    on: vi.fn((event: string, handler: (e: unknown) => void) => handlers.set(event, handler)),
    addControl: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    fitBounds: vi.fn(),
    hasImage: vi.fn(() => false),
    addImage: vi.fn(),
    easeTo: vi.fn(),
    setStyle: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn(() => 12),
    getCenter: vi.fn(() => ({ lat: 52.2, lng: 21.0 })),
    getCanvas: vi.fn(() => ({ style: {} as Record<string, string> })),
    queryRenderedFeatures: vi.fn(() => rendered),
  }
  return {
    setWorkerUrl: vi.fn(),
    Map: vi.fn(function Map() {
      return map
    }),
    NavigationControl: vi.fn(),
  }
})

function vehicle(over: Partial<CityVehicle> = {}): CityVehicle {
  return {
    id: 'v1', lat: 52.2, lon: 21.0, bearing: null, sideNumber: '1', ageSec: 5, headsign: 'Centrum',
    routeId: '20', shortName: '20', mode: 'tram', color: null, directionId: 0, nextStop: null, ...over,
  }
}

type Props = Parameters<typeof TransitMap>[0]
const base: Props = {
  ariaLabel: 'Mapa transportu',
  initialCamera: { lat: 52.23, lon: 21.01, zoom: 12 },
  backbone: [{ routeId: 'M1', line: 'M1', mode: 'metro', points: [[52.1, 21.0], [52.2, 21.0]] }],
  follow: null,
  vehicles: [vehicle()],
  stops: [{ id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' }],
  railStations: [{ id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 }],
  hidden: new Set<LayerKey>(),
  routeId: null,
  selected: null,
  focus: null,
  route: null,
  dark: false,
  onSelect: () => {},
}

async function mounted(props: Partial<Props> = {}) {
  const view = render(<TransitMap {...base} {...props} />)
  await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
  const map = vi.mocked(maplibregl.Map).mock.results[0].value
  handlers.get('style.load')?.({})
  return { ...view, map }
}

let reducedMotion = true
window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') && reducedMotion })) as unknown as typeof window.matchMedia

describe('TransitMap', () => {
  beforeEach(() => {
    reducedMotion = true
    vi.clearAllMocks()
    sources.clear()
    layers.clear()
    handlers.clear()
    rendered = []
  })

  it('names the map canvas in Polish and mounts MapLibre once, centred on the city, bounded to Poland', async () => {
    const { rerender } = await mounted()
    const [options] = vi.mocked(maplibregl.Map).mock.calls[0] as unknown as [Record<string, unknown>]
    expect((options.locale as Record<string, string>)['Map.Title']).toBe('Mapa transportu')
    expect(options.center).toEqual([21.01, 52.23])
    expect(options.maxBounds).toBeDefined()
    rerender(<TransitMap {...base} vehicles={[vehicle({ lat: 52.3 })]} />)
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
  })

  it('adds rail, stop, vehicle and selection layers with zoom thresholds from one place', async () => {
    const { map } = await mounted()
    const added = map.addLayer.mock.calls.map(([layer]: [{ id: string; minzoom?: number }]) => [layer.id, layer.minzoom])
    expect(added).toEqual(
      expect.arrayContaining([
        ['rail-1', 5],
        ['rail-3', 10],
        ['stops-metroStops', 11],
        ['stops-busStops', 14],
        ['vehicles-labels', 15],
        ['selected', undefined],
      ])
    )
    const vehicles = map.addSource.mock.calls.find(([id]: [string]) => id === 'vehicles')[1]
    expect(vehicles.data.features).toHaveLength(1)
  })

  it('pushes new vehicle positions and filters through setData, without remounting', async () => {
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} vehicles={[vehicle(), vehicle({ id: 'bus', mode: 'bus' })]} hidden={new Set<LayerKey>(['trams'])} />)
    const lastCall = sources.get('vehicles')!.setData.mock.calls.at(-1)![0]
    expect(lastCall.features.map((f: { properties: { id: string } }) => f.properties.id)).toEqual(['bus'])
  })

  it('hides point layers through layout visibility', async () => {
    const { map, rerender } = await mounted()
    rerender(<TransitMap {...base} hidden={new Set<LayerKey>(['busStops', 'rail'])} />)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('stops-busStops', 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('rail-2', 'visibility', 'none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith('stops-tramStops', 'visibility', 'visible')
  })

  it('reports the highest-priority hit on click, and null on empty map', async () => {
    const onSelect = vi.fn<(hit: MapHit | null) => void>()
    await mounted({ onSelect })
    rendered = [
      { layer: { id: 'stops-busStops' }, properties: { id: '100101' } },
      { layer: { id: 'vehicles' }, properties: { id: 'v1' } },
    ]
    handlers.get('click')!({ point: { x: 10, y: 10 } })
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'vehicle', id: 'v1' })
    rendered = []
    handlers.get('click')!({ point: { x: 10, y: 10 } })
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('flies to a new focus, switches the basemap with the theme, and reports view changes', async () => {
    const onViewChange = vi.fn()
    const { map, rerender } = await mounted({ onViewChange })
    rerender(<TransitMap {...base} onViewChange={onViewChange} focus={{ lat: 50.06, lon: 19.94, nonce: 1 }} />)
    expect(map.flyTo).toHaveBeenCalledWith({ center: [19.94, 50.06], zoom: 16 })
    rerender(<TransitMap {...base} onViewChange={onViewChange} dark />)
    expect(map.setStyle).toHaveBeenCalledWith('https://tiles.openfreemap.org/styles/dark')
    handlers.get('moveend')!({})
    expect(onViewChange).toHaveBeenCalledWith({ center: { lat: 52.2, lon: 21.0 }, zoom: 12 })
  })

  it('line mode: draws the route, frames it and dims everything else; leaving restores', async () => {
    const { map, rerender } = await mounted()
    const overlay = {
      line: { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [[21, 52], [21.1, 52.1]] as [number, number][] }, properties: {} }] },
      stops: { type: 'FeatureCollection' as const, features: [] },
      bounds: [[21, 52], [21.1, 52.1]] as [[number, number], [number, number]],
    }
    rerender(<TransitMap {...base} route={{ key: '20:0', overlay, color: '#dc2626' }} />)
    expect(sources.get('route-line')!.setData).toHaveBeenCalledWith(overlay.line)
    expect(map.fitBounds).toHaveBeenCalledWith(overlay.bounds, expect.objectContaining({ maxZoom: 15 }))
    expect(map.setPaintProperty).toHaveBeenCalledWith('stops-busStops', 'circle-opacity', 0.25)
    expect(map.setPaintProperty).toHaveBeenCalledWith('route-line', 'line-color', '#dc2626')

    rerender(<TransitMap {...base} route={null} />)
    expect(map.setPaintProperty).toHaveBeenLastCalledWith('stops-metroStops', 'circle-stroke-opacity', 1)
  })

  it('frames a route chosen before the basemap finished loading once it does', async () => {
    const overlay = { line: { type: 'FeatureCollection' as const, features: [] }, stops: { type: 'FeatureCollection' as const, features: [] }, bounds: [[21, 52], [21.1, 52.1]] as [[number, number], [number, number]] }
    render(<TransitMap {...base} route={{ key: '20:0', overlay, color: '#dc2626' }} />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const map = vi.mocked(maplibregl.Map).mock.results[0].value
    expect(map.fitBounds).not.toHaveBeenCalled()
    handlers.get('style.load')!({})
    expect(map.fitBounds).toHaveBeenCalledWith(overlay.bounds, expect.objectContaining({ maxZoom: 15 }))
  })

  it('glides vehicles between readings instead of jumping (unless reduced motion)', async () => {
    reducedMotion = false
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} vehicles={[vehicle()]} />) // pierwszy odczyt po montażu: rysunek bazowy
    const setData = sources.get('vehicles')!.setData
    setData.mockClear()
    frames.length = 0 // animacja poprzedniego odczytu anulowana w sprzątaniu efektu
    rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.2 })]} />)
    expect(setData).not.toHaveBeenCalled()
    const start = performance.now()
    frames.shift()!(start + 500)
    expect(setData.mock.calls.at(-1)![0].features[0].geometry.coordinates[0]).toBeCloseTo(21.1, 1)
    frames.shift()!(start + 1000)
    expect(setData.mock.calls.at(-1)![0].features[0].geometry.coordinates[0]).toBe(21.2)
    vi.unstubAllGlobals()
  })

  it('adds the direction arrow and the metro/rail backbone; follows a vehicle; reports a user drag', async () => {
    const onUserMove = vi.fn()
    const { map, rerender } = await mounted({ onUserMove })
    expect(map.addImage).toHaveBeenCalledWith('vehicle-arrow', expect.objectContaining({ width: 16 }), { sdf: true })
    const backbone = map.addSource.mock.calls.find(([id]: [string]) => id === 'backbone')[1]
    expect(backbone.data.features[0].geometry.coordinates).toEqual([[21.0, 52.1], [21.0, 52.2]])
    rerender(<TransitMap {...base} onUserMove={onUserMove} follow={{ lat: 52.3, lon: 21.3 }} />)
    expect(map.easeTo).toHaveBeenCalledWith({ center: [21.3, 52.3], duration: 1000 })
    handlers.get('dragstart')!({})
    expect(onUserMove).toHaveBeenCalled()
  })

  it('draws the selection ring', async () => {
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} selected={{ lat: 52.1, lon: 21.1 }} />)
    const ring = sources.get('selected')!.setData.mock.calls.at(-1)![0]
    expect(ring.features[0].geometry.coordinates).toEqual([21.1, 52.1])
  })
})
