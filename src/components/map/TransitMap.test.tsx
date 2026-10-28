// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { TransitMap, type MapHit } from './TransitMap'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import { FADE_START_SEC, HIDE_AFTER_SEC, MODE_COLOR, type LayerKey } from './mapData'
import { LINE_PALETTE } from '../transitMode'

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
    triggerRepaint: vi.fn(),
    setStyle: vi.fn(),
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    setPadding: vi.fn(),
    isMoving: vi.fn(() => false),
    getBounds: vi.fn(() => ({ contains: vi.fn(() => true) })),
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
    routeId: '20', shortName: '20', mode: 'tram', kind: 'regular', directionId: 0, nextStop: null, ...over,
  }
}

type Props = Parameters<typeof TransitMap>[0]
const base: Props = {
  ariaLabel: 'Mapa transportu',
  initialCamera: { lat: 52.23, lon: 21.01, zoom: 12 },
  backbone: [
    { routeId: 'M1', line: 'M1', mode: 'metro', points: [[52.1, 21.0], [52.2, 21.0]] },
    { routeId: 'S9', line: 'S9', mode: 'rail', points: [[52.3, 21.0], [52.4, 21.0]] },
  ],
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

const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 }
let reducedMotion = true
window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') && reducedMotion })) as unknown as typeof window.matchMedia

describe('TransitMap', () => {
  it('uses centered 22px heading markers and a 28px selected heading while unknown headings stay circles', async () => {
    const { map, rerender } = await mounted({ selected: { lat: 52.2, lon: 21, bearing: 90 } })
    const arrow = map.addLayer.mock.calls.find(([layer]: [{ id: string }]) => layer.id === 'vehicles-arrows')[0]
    expect(arrow.minzoom).toBeUndefined()
    expect(arrow.layout['icon-size']).toBe(22 / 16)
    expect(arrow.layout['icon-offset']).toBeUndefined()
    expect(map.addLayer.mock.calls.find(([layer]: [{ id: string }]) => layer.id === 'vehicles')[0].filter).toEqual(['!', ['has', 'bearing']])
    const selected = map.addLayer.mock.calls.find(([layer]: [{ id: string }]) => layer.id === 'selected-heading')[0]
    expect(selected.layout['icon-size']).toBe(28 / 16)
    rerender(<TransitMap {...base} selected={{ lat: 52.2, lon: 21, bearing: 180 }} />)
    expect(sources.get('selected')!.setData).toHaveBeenLastCalledWith(expect.objectContaining({ features: [expect.objectContaining({ properties: { bearing: 180 } })] }))
    rerender(<TransitMap {...base} selected={{ lat: 52.2, lon: 21 }} />)
    expect(sources.get('selected')!.setData).toHaveBeenLastCalledWith(expect.objectContaining({ features: [expect.objectContaining({ properties: {} })] }))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('keeps an initial vehicle focus until the asynchronously imported map has loaded its style', async () => {
    render(<TransitMap {...base} focus={{ lat: 52.23116, lon: 21.06149, nonce: 1 }} />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const map = vi.mocked(maplibregl.Map).mock.results[0].value
    handlers.get('style.load')!({})
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [21.06149, 52.23116] }))
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
    reducedMotion = false
    const onViewChange = vi.fn()
    const { map, rerender } = await mounted({ onViewChange })
    rerender(<TransitMap {...base} onViewChange={onViewChange} focus={{ lat: 50.06, lon: 19.94, nonce: 1 }} />)
    expect(map.flyTo).toHaveBeenCalledWith({ center: [19.94, 50.06], zoom: 16, padding: NO_PADDING, duration: 320 })
    rerender(<TransitMap {...base} onViewChange={onViewChange} focus={{ lat: 52.23, lon: 21.01, nonce: 2, zoom: 12 }} />)
    expect(map.flyTo).toHaveBeenLastCalledWith({ center: [21.01, 52.23], zoom: 12, padding: NO_PADDING, duration: 320 })
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
    expect(map.setPaintProperty).toHaveBeenCalledWith('route-casing', 'line-color', '#ffffff')

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

  it('re-aged vehicles at the same positions repaint once, without a glide (the hook re-ages them every tick)', async () => {
    reducedMotion = false
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} vehicles={[vehicle()]} />)
    const setData = sources.get('vehicles')!.setData
    setData.mockClear()
    frames.length = 0
    rerender(<TransitMap {...base} vehicles={[vehicle({ ageSec: 100 })]} />) // nowa tablica, ta sama pozycja, starszy wiek
    expect(frames).toHaveLength(0)
    expect(setData.mock.calls.at(-1)![0].features[0].properties.opacity).toBeLessThan(1)
    vi.unstubAllGlobals()
  })

  describe('the 10 s age clock (PR10): ticks hand over a new array with unchanged positions', () => {
    const cancel = vi.fn()
    let frames: FrameRequestCallback[] = []

    async function glidingTowards(lon: number) {
      reducedMotion = false
      frames = []
      cancel.mockClear()
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
      vi.stubGlobal('cancelAnimationFrame', cancel)
      const view = await mounted()
      view.rerender(<TransitMap {...base} vehicles={[vehicle(), vehicle({ id: 'b', lon: 21.05 })]} />)
      const setData = sources.get('vehicles')!.setData
      setData.mockClear()
      frames.length = 0
      view.rerender(<TransitMap {...base} vehicles={[vehicle({ lon }), vehicle({ id: 'b', lon: 21.05 })]} />)
      const start = performance.now() // after the effect: its own start is earlier, so start + 1000 is past the end
      frames.shift()!(start + 500) // połowa przejazdu
      setData.mockClear()
      cancel.mockClear()
      return { ...view, setData, start }
    }

    afterEach(() => vi.unstubAllGlobals())

    it('a tick that changes nothing visible (still fully opaque) calls no setData and schedules no frame', async () => {
      reducedMotion = false
      frames = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
      vi.stubGlobal('cancelAnimationFrame', cancel)
      const { rerender } = await mounted()
      rerender(<TransitMap {...base} vehicles={[vehicle()]} />)
      const setData = sources.get('vehicles')!.setData
      setData.mockClear()
      rerender(<TransitMap {...base} vehicles={[vehicle({ ageSec: 15 })]} />)
      rerender(<TransitMap {...base} vehicles={[vehicle({ ageSec: 25 })]} />)
      expect(setData).not.toHaveBeenCalled()
      expect(frames).toHaveLength(0)
    })

    it('a tick during a glide does not cut it: no cancel, no snap to the end, the last frame still lands on the new reading', async () => {
      const { rerender, setData, start } = await glidingTowards(21.2)
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.2, ageSec: 15 }), vehicle({ id: 'b', lon: 21.05, ageSec: 15 })]} />)
      expect(cancel).not.toHaveBeenCalled()
      expect(setData).not.toHaveBeenCalled()
      expect(frames).toHaveLength(1)
      frames.shift()!(start + 1000)
      const [a] = setData.mock.calls.at(-1)![0].features
      expect(a.geometry.coordinates[0]).toBe(21.2)
    })

    it('a tick during a glide that changes the paint (fade) lets the running frames draw it, without a snap', async () => {
      const { rerender, setData, start } = await glidingTowards(21.2)
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.2, ageSec: FADE_START_SEC + 45 }), vehicle({ id: 'b', lon: 21.05 })]} />)
      expect(cancel).not.toHaveBeenCalled()
      expect(setData).not.toHaveBeenCalled()
      frames.shift()!(start + 1000)
      const [a, b] = setData.mock.calls.at(-1)![0].features
      expect(a.geometry.coordinates[0]).toBe(21.2)
      expect(a.properties.opacity).toBeCloseTo(0.5, 1)
      expect(b.properties.opacity).toBe(1)
    })

    it('a vehicle that ages out mid-glide leaves with the next frame while the others keep gliding', async () => {
      const { rerender, setData, start } = await glidingTowards(21.2)
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.2 }), vehicle({ id: 'b', lon: 21.05, ageSec: HIDE_AFTER_SEC + 10 })]} />)
      expect(cancel).not.toHaveBeenCalled()
      frames.shift()!(start + 1000)
      const ids = setData.mock.calls.at(-1)![0].features.map((f: { properties: { id: string } }) => f.properties.id)
      expect(ids).toEqual(['v1'])
    })

    it('unmounting cancels the running glide (the effect no longer does it on every tick)', async () => {
      const { unmount } = await glidingTowards(21.2)
      unmount()
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('a new reading mid-glide still replaces it (positions moved again)', async () => {
      const { rerender } = await glidingTowards(21.2)
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.3 }), vehicle({ id: 'b', lon: 21.05 })]} />)
      expect(cancel).toHaveBeenCalledTimes(1) // the old loop is cancelled (the stub keeps its queued frame), a new one is queued
      expect(frames).toHaveLength(2)
    })

    it.each([15, FADE_START_SEC + 45])('a reading interrupts from the painted position after an age tick (%s s), not the previous target', async (ageSec) => {
      const { rerender, setData } = await glidingTowards(21.2)
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.2, ageSec }), vehicle({ id: 'b', lon: 21.05 })]} />)
      frames.length = 0 // cancelAnimationFrame is a spy; discard the cancelled callback before taking the replacement.
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.3 }), vehicle({ id: 'b', lon: 21.05 })]} />)
      const start = performance.now()
      frames.shift()!(start)
      expect(setData.mock.calls.at(-1)![0].features[0].geometry.coordinates[0]).toBeCloseTo(21.1, 2)
      frames.shift()!(start + 1000)
      expect(setData.mock.calls.at(-1)![0].features[0].geometry.coordinates[0]).toBe(21.3)
      setData.mockClear()
      rerender(<TransitMap {...base} vehicles={[vehicle({ lon: 21.3 }), vehicle({ id: 'b', lon: 21.05 })]} />)
      expect(setData).not.toHaveBeenCalled()
      expect(frames).toHaveLength(0)
    })

    it('enabling reduced motion during a glide paints the target on the next frame and ends the loop', async () => {
      const { setData, start } = await glidingTowards(21.2)
      reducedMotion = true
      frames.shift()!(start + 600)
      expect(setData.mock.calls.at(-1)![0].features[0].geometry.coordinates[0]).toBe(21.2)
      expect(frames).toHaveLength(0)
    })
  })

  it('casing under the backbone is dark red for yellow metro and white otherwise; the route casing follows the route colour', async () => {
    const { map } = await mounted()
    const layer = (id: string) => map.addLayer.mock.calls.find(([l]: [{ id: string }]) => l.id === id)![0]
    expect(layer('backbone-casing').paint['line-color']).toEqual(['match', ['get', 'color'], MODE_COLOR.metro, LINE_PALETTE.metro.fg, '#ffffff'])
    expect(layer('route-casing').paint['line-color']).toBe('#ffffff')
  })

  it('on the dark basemap the backbone casing is white for every line (yellow needs no dark casing there)', async () => {
    const { map } = await mounted({ dark: true })
    const casing = map.addLayer.mock.calls.find(([l]: [{ id: string }]) => l.id === 'backbone-casing')![0]
    expect(casing.paint['line-color']).toBe('#ffffff')
  })

  it('route casing follows the same light/dark rule as the backbone casing, also when the route changes', async () => {
    const overlay = { line: { type: 'FeatureCollection' as const, features: [] }, stops: { type: 'FeatureCollection' as const, features: [] }, bounds: null }
    const dark = await mounted({ dark: true, route: { key: 'M1:0', overlay, color: MODE_COLOR.metro } })
    const initial = dark.map.addLayer.mock.calls.find(([l]: [{ id: string }]) => l.id === 'route-casing')![0]
    expect(initial.paint['line-color']).toBe('#ffffff')
    dark.rerender(<TransitMap {...base} dark route={{ key: 'M2:0', overlay, color: MODE_COLOR.metro }} />)
    expect(dark.map.setPaintProperty).toHaveBeenCalledWith('route-stops', 'circle-stroke-color', LINE_PALETTE.metro.fg)
    expect(dark.map.setPaintProperty).toHaveBeenCalledWith('route-casing', 'line-color', '#ffffff')
  })

  it('adds the direction arrow and the metro/rail backbone; follows a vehicle; reports a user drag', async () => {
    const onUserMove = vi.fn()
    const { map, rerender } = await mounted({ onUserMove })
    expect(map.addImage).toHaveBeenCalledWith('vehicle-arrow', expect.objectContaining({ width: 64 }), { sdf: true, pixelRatio: 3 })
    const backbone = map.addSource.mock.calls.find(([id]: [string]) => id === 'backbone')[1]
    expect(backbone.data.features[0].geometry.coordinates).toEqual([[21.0, 52.1], [21.0, 52.2]])
    // Kolor rodzaju z jednej palety — `route_color` z feedu (M1 `#0000BB`) jest ignorowany.
    expect(backbone.data.features.map((f: { properties: { color: string } }) => f.properties.color)).toEqual([MODE_COLOR.metro, MODE_COLOR.rail])
    rerender(<TransitMap {...base} onUserMove={onUserMove} follow={{ lat: 52.3, lon: 21.3 }} />)
    expect(map.easeTo).toHaveBeenCalledWith({ center: [21.3, 52.3], duration: 1000, padding: NO_PADDING })
    handlers.get('dragstart')!({})
    expect(onUserMove).toHaveBeenCalled()
  })

  it('right-click and a 500 ms press report a point for "nearby"; a moving finger does not', async () => {
    const onContextPoint = vi.fn()
    await mounted({ onContextPoint })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    handlers.get('contextmenu')!({ lngLat: { lat: 52.1, lng: 21.1 } })
    expect(onContextPoint).toHaveBeenLastCalledWith({ lat: 52.1, lon: 21.1 })

    const touch = { lngLat: { lat: 52.2, lng: 21.2 }, originalEvent: { touches: [{}] } }
    handlers.get('touchstart')!(touch)
    vi.advanceTimersByTime(500)
    expect(onContextPoint).toHaveBeenLastCalledWith({ lat: 52.2, lon: 21.2 })

    onContextPoint.mockClear()
    handlers.get('touchstart')!(touch)
    handlers.get('touchmove')!({})
    handlers.get('touchstart')!({ ...touch, originalEvent: { touches: [{}, {}] } })
    vi.advanceTimersByTime(1000)
    expect(onContextPoint).not.toHaveBeenCalled()
  })

  it('reports what is in view only while the list is open, deduplicated and capped', async () => {
    const onVisibleChange = vi.fn()
    const { map, rerender } = await mounted({ onVisibleChange })
    rendered = [
      { layer: { id: 'vehicles' }, properties: { id: 'v1', label: '20' } as never },
      { layer: { id: 'vehicles' }, properties: { id: 'v1', label: '20' } as never },
      { layer: { id: 'rail-1' }, properties: { id: '33605', name: 'Warszawa Centralna' } as never },
      { layer: { id: 'stops-busStops' }, properties: { id: '100101', label: 'Centrum 01' } as never },
    ]
    handlers.get('idle')!({})
    expect(onVisibleChange).not.toHaveBeenCalled()
    rerender(<TransitMap {...base} onVisibleChange={onVisibleChange} listOpen />)
    expect(map.triggerRepaint).toHaveBeenCalled()
    handlers.get('idle')!({})
    expect(onVisibleChange).toHaveBeenLastCalledWith(
      [
        { kind: 'vehicle', id: 'v1', label: '20' },
        { kind: 'rail', id: '33605', label: 'Warszawa Centralna' },
        { kind: 'stop', id: '100101', label: 'Centrum 01' },
      ],
      false
    )
  })

  it('rings pinnedItems and filters vehicles to disrupted lines', async () => {
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} pinnedItems={[{ lat: 52.23, lon: 21.0 }]} onlyLines={new Set(['9'])} />)
    expect(sources.get('pinnedItems')!.setData.mock.calls.at(-1)![0].features[0].geometry.coordinates).toEqual([21.0, 52.23])
    expect(sources.get('vehicles')!.setData.mock.calls.at(-1)![0].features).toEqual([])
  })

  it('draws the selection ring', async () => {
    const { rerender } = await mounted()
    rerender(<TransitMap {...base} selected={{ lat: 52.1, lon: 21.1 }} />)
    const ring = sources.get('selected')!.setData.mock.calls.at(-1)![0]
    expect(ring.features[0].geometry.coordinates).toEqual([21.1, 52.1])
  })
})

describe('TransitMap camera insets', () => {
  const INSETS = { top: 80, bottom: 300 }
  const PADDING = { top: 80, bottom: 300, left: 0, right: 0 }
  const AT = { lat: 52.1, lon: 21.1 }
  const eased = (map: { easeTo: ReturnType<typeof vi.fn> }) => map.easeTo.mock.calls.filter(([o]) => o.duration !== 1000)

  beforeEach(() => {
    reducedMotion = false
    vi.clearAllMocks()
    sources.clear()
    layers.clear()
    handlers.clear()
    rendered = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('focus passes padding derived from insets to flyTo', async () => {
    const { map, rerender } = await mounted({ insets: INSETS })
    rerender(<TransitMap {...base} insets={INSETS} focus={{ lat: 50.06, lon: 19.94, nonce: 1 }} />)
    const [options] = map.flyTo.mock.calls[0]
    expect(options).toMatchObject({ center: [19.94, 50.06], zoom: 16, padding: PADDING })
    expect(options.duration).toBeLessThanOrEqual(320)
    expect(map.jumpTo).not.toHaveBeenCalled()
  })

  it('inset change while selected eases with padding (≤320 ms), once the values settle', async () => {
    const { map, rerender } = await mounted({ selected: AT, insets: { top: 80, bottom: 120 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Arkusz jedzie: kolejne pomiary nie ruszają kamery, dopiero ustalona wartość.
    rerender(<TransitMap {...base} selected={AT} insets={{ top: 80, bottom: 200 }} />)
    vi.advanceTimersByTime(60)
    rerender(<TransitMap {...base} selected={AT} insets={INSETS} />)
    vi.advanceTimersByTime(60)
    expect(map.easeTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(map.easeTo).toHaveBeenCalledTimes(1)
    const [options] = map.easeTo.mock.calls[0]
    expect(options).toMatchObject({ center: [AT.lon, AT.lat], padding: PADDING })
    expect(options.duration).toBeLessThanOrEqual(320)
    expect(options).not.toHaveProperty('zoom')
  })

  it('inset change without a selection leaves the camera alone', async () => {
    const { map, rerender } = await mounted({ insets: { top: 80, bottom: 120 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    rerender(<TransitMap {...base} insets={INSETS} />)
    vi.advanceTimersByTime(500)
    expect(eased(map)).toEqual([])
    expect(map.flyTo).not.toHaveBeenCalled()
    expect(map.jumpTo).not.toHaveBeenCalled()
  })

  it('a focus already carries the new padding, so the settle timer does not repeat it', async () => {
    const { map, rerender } = await mounted({ selected: AT, insets: { top: 80, bottom: 120 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    rerender(<TransitMap {...base} selected={AT} insets={INSETS} focus={{ ...AT, nonce: 1 }} />)
    vi.advanceTimersByTime(500)
    expect(map.flyTo).toHaveBeenCalledTimes(1)
    expect(eased(map)).toEqual([])
  })

  it('a correcting ease waits for a focus flight in progress and never interrupts it (sheet remounts one render after the focus)', async () => {
    const { map, rerender } = await mounted({ selected: AT, insets: { top: 80, bottom: 370 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    map.isMoving.mockReturnValue(true) // lot ruszył w render N ze starymi insetami (370)…
    rerender(<TransitMap {...base} selected={AT} insets={{ top: 80, bottom: 370 }} focus={{ ...AT, nonce: 1 }} />)
    expect(map.flyTo).toHaveBeenCalledTimes(1)
    // …a nowy arkusz (peek) zgłasza swoją wysokość dopiero w render N+1.
    rerender(<TransitMap {...base} selected={AT} insets={{ top: 80, bottom: 190 }} focus={{ ...AT, nonce: 1 }} />)
    vi.advanceTimersByTime(600) // lot trwa: kilka cykli ponawiania, żadnego easeTo
    expect(eased(map)).toEqual([])
    map.isMoving.mockReturnValue(false) // lądowanie
    vi.advanceTimersByTime(200)
    expect(eased(map)).toHaveLength(1)
    const [options] = map.easeTo.mock.calls.at(-1)!
    expect(options).toMatchObject({ center: [AT.lon, AT.lat], padding: { top: 80, bottom: 190, left: 0, right: 0 } })
    expect(options).not.toHaveProperty('zoom') // zoom lotu zostaje (ease po lądowaniu nie zmienia go)
  })

  it('an inset change after the user panned the selection out of view does not pull the camera back', async () => {
    const { map, rerender } = await mounted({ selected: AT, insets: { top: 80, bottom: 120 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    map.getBounds.mockReturnValue({ contains: vi.fn(() => false) })
    rerender(<TransitMap {...base} selected={AT} insets={INSETS} />)
    vi.advanceTimersByTime(500)
    expect(eased(map)).toEqual([])
    expect(map.jumpTo).not.toHaveBeenCalled()
    map.getBounds.mockReturnValue({ contains: vi.fn(() => true) }) // mock mapy jest wspólny dla testów
  })

  it('reduced motion uses no animation', async () => {
    reducedMotion = true
    const { map, rerender } = await mounted({ selected: AT, insets: { top: 80, bottom: 120 } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    rerender(<TransitMap {...base} selected={AT} insets={INSETS} focus={{ lat: 50.06, lon: 19.94, nonce: 1 }} />)
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [19.94, 50.06], zoom: 16, padding: PADDING })
    expect(map.flyTo).not.toHaveBeenCalled()
    rerender(<TransitMap {...base} selected={AT} insets={{ top: 80, bottom: 400 }} focus={{ lat: 50.06, lon: 19.94, nonce: 1 }} />)
    vi.advanceTimersByTime(500)
    expect(map.jumpTo).toHaveBeenLastCalledWith({ center: [AT.lon, AT.lat], padding: { top: 80, bottom: 400, left: 0, right: 0 } })
    expect(eased(map)).toEqual([])
  })

  it('creates the map with the current insets as camera padding (the initial centre is the centre of the free area)', async () => {
    const { map } = await mounted({ insets: INSETS, selected: AT })
    expect(map.setPadding).toHaveBeenCalledWith(PADDING)
    // Stan startowy zna swoje insety: ustalone te same wartości nie ruszają kamery.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.advanceTimersByTime(500)
    expect(map.easeTo).not.toHaveBeenCalled()
    expect(map.jumpTo).not.toHaveBeenCalled()
  })


  it('changing insets does not recreate the map', async () => {
    const { map, rerender } = await mounted({ insets: { top: 0, bottom: 0 } })
    rerender(<TransitMap {...base} insets={{ top: 80, bottom: 120 }} />)
    rerender(<TransitMap {...base} insets={INSETS} />)
    rerender(<TransitMap {...base} />)
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    expect(map.remove).not.toHaveBeenCalled()
  })

  it('frames a route inside the free area: the bottom inset is added to the margin and replaces any earlier padding', async () => {
    const overlay = { line: { type: 'FeatureCollection' as const, features: [] }, stops: { type: 'FeatureCollection' as const, features: [] }, bounds: [[21, 52], [21.1, 52.1]] as [[number, number], [number, number]] }
    const { map, rerender } = await mounted({ insets: INSETS })
    rerender(<TransitMap {...base} insets={INSETS} route={{ key: '20:0', overlay, color: '#dc2626' }} />)
    const [, options] = map.fitBounds.mock.calls[0]
    expect(options).toMatchObject({ maxZoom: 15, absolutePadding: true })
    expect(options.padding.bottom).toBe(INSETS.bottom + 16)
    expect(options.padding.top).toBeGreaterThanOrEqual(INSETS.top)
  })

  it('theme switch keeps selection and layers', async () => {
    const overlay = { line: { type: 'FeatureCollection' as const, features: [] }, stops: { type: 'FeatureCollection' as const, features: [] }, bounds: [[21, 52], [21.1, 52.1]] as [[number, number], [number, number]] }
    const props = { selected: AT, hidden: new Set<LayerKey>(['busStops']), route: { key: '20:0', overlay, color: '#dc2626' }, follow: { lat: 52.3, lon: 21.3 } }
    const { map, rerender } = await mounted(props)
    // Prawdziwy `setStyle` wyrzuca źródła i warstwy; ponowne dodanie robi `style.load`.
    map.setStyle.mockImplementation(() => {
      sources.clear()
      layers.clear()
    })
    for (const camera of [map.flyTo, map.jumpTo, map.easeTo, map.fitBounds, map.addSource, map.setLayoutProperty, map.setPaintProperty]) camera.mockClear()

    rerender(<TransitMap {...base} {...props} dark />)
    expect(map.setStyle).toHaveBeenCalledWith('https://tiles.openfreemap.org/styles/dark')
    handlers.get('style.load')!({})

    const ring = map.addSource.mock.calls.find(([id]: [string]) => id === 'selected')[1]
    expect(ring.data.features[0].geometry.coordinates).toEqual([AT.lon, AT.lat])
    expect(map.setLayoutProperty).toHaveBeenCalledWith('stops-busStops', 'visibility', 'none')
    expect(map.setPaintProperty).toHaveBeenCalledWith('stops-busStops', 'circle-opacity', 0.25)
    expect(layers.has('selected')).toBe(true)
    // Motyw nie rusza kamery: ani przelotu, ani ponownego kadru trasy, ani drugiego „follow".
    expect(map.flyTo).not.toHaveBeenCalled()
    expect(map.jumpTo).not.toHaveBeenCalled()
    expect(map.easeTo).not.toHaveBeenCalled()
    expect(map.fitBounds).not.toHaveBeenCalled()
  })
})
