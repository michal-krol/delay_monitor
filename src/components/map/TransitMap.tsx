'use client'

import { useEffect, useRef } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import { WORKER_URL } from '../MapView'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { CityStop } from '@/lib/gtfs/query'
import type { MapRailStation } from '@/lib/weather/coordinates'
import {
  MAP_ZOOM,
  MODE_COLOR,
  POLAND_BOUNDS,
  railToGeoJSON,
  stopsToGeoJSON,
  vehiclesToGeoJSON,
  type LayerKey,
  type PointCollection,
  type RouteOverlay,
} from './mapData'

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'
const FONT = ['Noto Sans Regular']

export type MapHit = { kind: 'vehicle' | 'stop' | 'rail'; id: string }
export type MapView = { center: { lat: number; lon: number }; zoom: number }

/** Warstwy klikalne, w kolejności pierwszeństwa, gdy pod palcem jest kilka obiektów. */
const HIT_LAYERS: { layer: string; kind: MapHit['kind'] }[] = [
  { layer: 'vehicles', kind: 'vehicle' },
  { layer: 'stops-metroStops', kind: 'stop' },
  { layer: 'rail-1', kind: 'rail' },
  { layer: 'rail-2', kind: 'rail' },
  { layer: 'rail-3', kind: 'rail' },
  { layer: 'stops-tramStops', kind: 'stop' },
  { layer: 'stops-busStops', kind: 'stop' },
]
/** Tolerancja trafienia (px) — kropka przystanku ma 5 px, palec dużo więcej. */
const HIT_SLOP = 10

/** Warstwy MapLibre sterowane jednym kluczem filtra. Pojazdy filtrowane na danych (`vehiclesToGeoJSON`). */
const LAYERS_OF: Partial<Record<LayerKey, string[]>> = {
  rail: ['rail-1', 'rail-2', 'rail-3', 'rail-labels-major', 'rail-labels'],
  metroStops: ['stops-metroStops'],
  tramStops: ['stops-tramStops'],
  busStops: ['stops-busStops'],
}

const EMPTY: PointCollection = { type: 'FeatureCollection', features: [] }

type Data = {
  vehicles: PointCollection
  stops: PointCollection
  rail: PointCollection
  selected: PointCollection
  route: RouteOverlay
  routeColor: string
}

const EMPTY_ROUTE: RouteOverlay = { line: { type: 'FeatureCollection', features: [] }, stops: EMPTY, bounds: null }
/** Tryb linii przyciemnia wszystko poza trasą i jej pojazdami (spec §6). */
const DIMMABLE = ['rail-1', 'rail-2', 'rail-3', 'stops-busStops', 'stops-tramStops', 'stops-metroStops']
const DIM_OPACITY = 0.25

function selectedCollection(selected: { lat: number; lon: number } | null): PointCollection {
  if (selected === null) return EMPTY
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [selected.lon, selected.lat] }, properties: {} }] }
}

/**
 * Źródła i warstwy mapy. Idempotentne i wywoływane PO KAŻDYM załadowaniu stylu:
 * zmiana motywu (`setStyle`) wyrzuca wszystkie nasze warstwy, więc dodajemy je
 * od nowa z bieżących danych z `ref`-a.
 */
function addLayers(map: MapLibreMap, data: Data, hidden: ReadonlySet<LayerKey>, dark: boolean, dimmed: boolean): void {
  if (map.getSource('vehicles') !== undefined) return
  const labelPaint = {
    'text-color': dark ? '#e2e8f0' : '#1e293b',
    'text-halo-color': dark ? '#0f172a' : '#ffffff',
    'text-halo-width': 1.5,
  }
  const stroke = { 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 }

  map.addSource('rail', { type: 'geojson', data: data.rail })
  map.addSource('stops', { type: 'geojson', data: data.stops })
  map.addSource('vehicles', { type: 'geojson', data: data.vehicles })
  map.addSource('selected', { type: 'geojson', data: data.selected })
  map.addSource('route-line', { type: 'geojson', data: data.route.line })
  map.addSource('route-stops', { type: 'geojson', data: data.route.stops })

  // Kolej: ranga ruchu decyduje, od jakiego zoomu stacja jest widoczna — mapa
  // kraju pokazuje węzły, nie 3 tys. kropek (bez klastrów liczbowych, spec §11).
  const railMinZoom = { 1: MAP_ZOOM.min, 2: MAP_ZOOM.railTier2, 3: MAP_ZOOM.railTier3 }
  for (const tier of [1, 2, 3] as const) {
    map.addLayer({
      id: `rail-${tier}`,
      type: 'circle',
      source: 'rail',
      minzoom: railMinZoom[tier],
      filter: ['==', ['get', 'tier'], tier],
      paint: {
        'circle-color': MODE_COLOR.rail,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, tier === 1 ? 3 : 2, 10, 4, 14, 7],
        ...stroke,
      },
    })
  }

  const stopMinZoom = { metroStops: MAP_ZOOM.metroStops, tramStops: MAP_ZOOM.stops, busStops: MAP_ZOOM.stops }
  for (const key of ['busStops', 'tramStops', 'metroStops'] as const) {
    map.addLayer({
      id: `stops-${key}`,
      type: 'circle',
      source: 'stops',
      minzoom: stopMinZoom[key],
      filter: ['==', ['get', 'layer'], key],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius':
          key === 'metroStops'
            ? ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7]
            : ['interpolate', ['linear'], ['zoom'], 14, 2.5, 17, 5],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })
  }
  map.addLayer({
    id: 'stops-labels',
    type: 'symbol',
    source: 'stops',
    minzoom: MAP_ZOOM.stopLabels,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
    paint: labelPaint,
  })
  map.addLayer({
    id: 'rail-labels-major',
    type: 'symbol',
    source: 'rail',
    minzoom: MAP_ZOOM.railLabelsMajor,
    maxzoom: MAP_ZOOM.railLabels,
    filter: ['==', ['get', 'tier'], 1],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top' },
    paint: labelPaint,
  })
  map.addLayer({
    id: 'rail-labels',
    type: 'symbol',
    source: 'rail',
    minzoom: MAP_ZOOM.railLabels,
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top' },
    paint: labelPaint,
  })

  // Trasa wybranej linii — nad przystankami i koleją, pod pojazdami.
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': data.routeColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7], 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'route-stops',
    type: 'circle',
    source: 'route-stops',
    paint: {
      'circle-color': '#ffffff',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 5],
      'circle-stroke-color': data.routeColor,
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'route-stops-labels',
    type: 'symbol',
    source: 'route-stops',
    minzoom: MAP_ZOOM.metroStops + 2,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
    paint: labelPaint,
  })

  map.addLayer({
    id: 'vehicles',
    type: 'circle',
    source: 'vehicles',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-opacity': ['get', 'opacity'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4.5, 16, 8],
      ...stroke,
    },
  })
  map.addLayer({
    id: 'vehicles-labels',
    type: 'symbol',
    source: 'vehicles',
    minzoom: MAP_ZOOM.vehicleLabels,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, -1.3], 'text-anchor': 'bottom' },
    paint: labelPaint,
  })

  // Obwódka wybranego obiektu — BEZ minzoom: wynik wyszukiwania widać zawsze (spec §2).
  map.addLayer({
    id: 'selected',
    type: 'circle',
    source: 'selected',
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': dark ? '#a5b4fc' : '#4338ca',
      'circle-stroke-width': 3,
    },
  })

  applyHidden(map, hidden)
  applyDim(map, dimmed)
}

function applyDim(map: MapLibreMap, dimmed: boolean): void {
  for (const layer of DIMMABLE) {
    if (map.getLayer(layer) === undefined) continue
    map.setPaintProperty(layer, 'circle-opacity', dimmed ? DIM_OPACITY : 1)
    map.setPaintProperty(layer, 'circle-stroke-opacity', dimmed ? DIM_OPACITY : 1)
  }
}

function applyHidden(map: MapLibreMap, hidden: ReadonlySet<LayerKey>): void {
  for (const [key, layers] of Object.entries(LAYERS_OF)) {
    for (const layer of layers ?? []) {
      if (map.getLayer(layer) !== undefined) map.setLayoutProperty(layer, 'visibility', hidden.has(key as LayerKey) ? 'none' : 'visible')
    }
  }
}

/** Kadr na trasę — z miejscem na pasek wyszukiwania u góry. */
function fitRoute(map: MapLibreMap, bounds: NonNullable<RouteOverlay['bounds']>): void {
  map.fitBounds(bounds, { padding: { top: 150, right: 40, bottom: 40, left: 40 }, maxZoom: 15 })
}

function pickHit(features: MapGeoJSONFeature[]): MapHit | null {
  for (const { layer, kind } of HIT_LAYERS) {
    const feature = features.find((f) => f.layer.id === layer)
    const id = feature?.properties?.id
    if (typeof id === 'string') return { kind, id }
  }
  return null
}

/**
 * Mapa transportu: kolej z całej Polski, przystanki i pojazdy miasta — wszystko
 * jako warstwy GeoJSON (WebGL), żadnych markerów DOM (tysiące punktów). Montuje
 * się RAZ; dane idą przez `setData`, filtry przez widoczność warstw, motyw przez
 * `setStyle` + ponowne `addLayers`. Nic w tym komponencie nie decyduje, co
 * pokazać w karcie — tylko zgłasza trafienie (`onSelect`).
 *
 * Zewnętrzny `absolute inset-0` + wewnętrzny `h-full w-full` — patrz pułapka
 * `maplibregl-map { position: relative }` (AGENTS.md #6, CHANGELOG mapy miasta).
 */
export function TransitMap({
  ariaLabel,
  initialCenter,
  vehicles,
  stops,
  railStations,
  hidden,
  routeId,
  selected,
  focus,
  route,
  dark,
  onSelect,
  onViewChange,
}: {
  ariaLabel: string
  initialCenter: { lat: number; lon: number }
  vehicles: CityVehicle[]
  stops: CityStop[] | null
  railStations: MapRailStation[] | null
  hidden: ReadonlySet<LayerKey>
  /** Wybrana linia — pokazujemy tylko jej pojazdy. */
  routeId: string | null
  /** Pozycja wybranego obiektu (obwódka). Pojazd: aktualizowana z każdym odczytem. */
  selected: { lat: number; lon: number } | null
  /** Przelot kamery — nowy `nonce` = nowy przelot, także do tego samego miejsca. */
  focus: { lat: number; lon: number; nonce: number } | null
  /** Tryb linii: przebieg wybranego kierunku; `key` zmienia się z linią/kierunkiem (nowy kadr). */
  route: { key: string; overlay: RouteOverlay; color: string } | null
  dark: boolean
  onSelect: (hit: MapHit | null) => void
  onViewChange?: (view: MapView) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const dataRef = useRef<Data>({ vehicles: EMPTY, stops: EMPTY, rail: EMPTY, selected: EMPTY, route: EMPTY_ROUTE, routeColor: MODE_COLOR.bus })
  const dimmedRef = useRef(false)
  /** Kadr trasy wybranej, zanim styl mapy się wczytał — dopasujemy go po `style.load`. */
  const pendingFitRef = useRef<RouteOverlay['bounds']>(null)
  const hiddenRef = useRef(hidden)
  const darkRef = useRef(dark)
  const onSelectRef = useRef(onSelect)
  const onViewChangeRef = useRef(onViewChange)
  useEffect(() => {
    onSelectRef.current = onSelect
    onViewChangeRef.current = onViewChange
  })

  useEffect(() => {
    if (containerRef.current === null) return
    let cancelled = false
    let map: MapLibreMap | null = null

    import('maplibre-gl').then((lib) => {
      if (cancelled || containerRef.current === null) return
      lib.setWorkerUrl(WORKER_URL)
      map = new lib.Map({
        container: containerRef.current,
        style: darkRef.current ? STYLE_DARK : STYLE_LIGHT,
        center: [initialCenter.lon, initialCenter.lat],
        zoom: MAP_ZOOM.initial,
        minZoom: MAP_ZOOM.min,
        maxBounds: POLAND_BOUNDS,
        // Zwinięta atrybucja (ikona „i") — rozwinięta zasłaniała legendę na telefonie.
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        locale: {
          // Canvas MapLibre ma własny `role="region"` — bez tego czytnik słyszy angielskie „Map".
          'Map.Title': ariaLabel,
          'NavigationControl.ZoomIn': 'Przybliż',
          'NavigationControl.ZoomOut': 'Oddal',
          'AttributionControl.ToggleAttribution': 'Pokaż źródła danych mapy',
        },
      })
      map.touchZoomRotate.disableRotation()
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = map
      const mapInstance = map

      mapInstance.on('style.load', () => {
        addLayers(mapInstance, dataRef.current, hiddenRef.current, darkRef.current, dimmedRef.current)
        if (pendingFitRef.current !== null) fitRoute(mapInstance, pendingFitRef.current)
        pendingFitRef.current = null
      })

      const hitsAt = (point: { x: number; y: number }): MapHit | null => {
        const layers = HIT_LAYERS.map((h) => h.layer).filter((layer) => mapInstance.getLayer(layer) !== undefined)
        if (layers.length === 0) return null
        const box: [[number, number], [number, number]] = [
          [point.x - HIT_SLOP, point.y - HIT_SLOP],
          [point.x + HIT_SLOP, point.y + HIT_SLOP],
        ]
        return pickHit(mapInstance.queryRenderedFeatures(box, { layers }))
      }
      mapInstance.on('click', (e) => onSelectRef.current(hitsAt(e.point)))
      mapInstance.on('mousemove', (e) => {
        mapInstance.getCanvas().style.cursor = hitsAt(e.point) !== null ? 'pointer' : ''
      })
      mapInstance.on('moveend', () => {
        const center = mapInstance.getCenter()
        onViewChangeRef.current?.({ center: { lat: center.lat, lon: center.lng }, zoom: mapInstance.getZoom() })
      })
    })

    return () => {
      cancelled = true
      mapRef.current = null
      map?.remove()
    }
    // Montowanie RAZ — `initialCenter` to tylko kadr startowy, zmiana miasta = `key` w rodzicu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    dataRef.current.vehicles = vehiclesToGeoJSON(vehicles, hidden, routeId)
    ;(mapRef.current?.getSource('vehicles') as GeoJSONSource | undefined)?.setData(dataRef.current.vehicles)
  }, [vehicles, hidden, routeId])

  useEffect(() => {
    dataRef.current.stops = stops === null ? EMPTY : stopsToGeoJSON(stops)
    ;(mapRef.current?.getSource('stops') as GeoJSONSource | undefined)?.setData(dataRef.current.stops)
  }, [stops])

  useEffect(() => {
    dataRef.current.rail = railStations === null ? EMPTY : railToGeoJSON(railStations)
    ;(mapRef.current?.getSource('rail') as GeoJSONSource | undefined)?.setData(dataRef.current.rail)
  }, [railStations])

  const selectedLat = selected?.lat
  const selectedLon = selected?.lon
  useEffect(() => {
    dataRef.current.selected = selectedCollection(selectedLat === undefined || selectedLon === undefined ? null : { lat: selectedLat, lon: selectedLon })
    ;(mapRef.current?.getSource('selected') as GeoJSONSource | undefined)?.setData(dataRef.current.selected)
  }, [selectedLat, selectedLon])

  const routeKey = route?.key ?? null
  useEffect(() => {
    const map = mapRef.current
    dataRef.current.route = route?.overlay ?? EMPTY_ROUTE
    dataRef.current.routeColor = route?.color ?? MODE_COLOR.bus
    dimmedRef.current = route !== null
    if (map === null || map.getSource('route-line') === undefined) {
      pendingFitRef.current = route?.overlay.bounds ?? null
      return
    }
    ;(map.getSource('route-line') as GeoJSONSource).setData(dataRef.current.route.line)
    ;(map.getSource('route-stops') as GeoJSONSource).setData(dataRef.current.route.stops)
    map.setPaintProperty('route-line', 'line-color', dataRef.current.routeColor)
    map.setPaintProperty('route-stops', 'circle-stroke-color', dataRef.current.routeColor)
    applyDim(map, route !== null)
    const bounds = route?.overlay.bounds
    if (bounds !== null && bounds !== undefined) fitRoute(map, bounds)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowy kadr tylko przy nowej linii/kierunku, nie przy każdym renderze
  }, [routeKey])

  useEffect(() => {
    hiddenRef.current = hidden
    if (mapRef.current !== null) applyHidden(mapRef.current, hidden)
  }, [hidden])

  useEffect(() => {
    if (darkRef.current === dark) return
    darkRef.current = dark
    // `style.load` (wyżej) doda nasze warstwy z powrotem na nowy podkład.
    mapRef.current?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT)
  }, [dark])

  const focusNonce = focus?.nonce
  useEffect(() => {
    if (focus === null || mapRef.current === null) return
    const map = mapRef.current
    // MapLibre sam skraca przelot przy `prefers-reduced-motion` (brak `essential`).
    map.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), MAP_ZOOM.focus) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- przelot tylko na nowy `nonce`, nie przy każdym renderze
  }, [focusNonce])

  return (
    <div className="absolute inset-0">
      {/* Region z nazwą to canvas MapLibre (`Map.Title` wyżej) — drugi, zagnieżdżony byłby szumem dla czytnika. */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
