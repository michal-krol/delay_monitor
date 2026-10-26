'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import { STYLE_DARK, STYLE_LIGHT, WORKER_URL } from '../MapView'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { BackboneLine, CityStop } from '@/lib/gtfs/query'
import type { MapRailStation } from '@/lib/weather/coordinates'
import {
  MAP_ZOOM,
  arrowImage,
  interpolatePoints,
  casingExpression,
  casingFor,
  outlineFor,
  strokeExpression,
  MODE_COLOR,
  POLAND_BOUNDS,
  railToGeoJSON,
  stopsToGeoJSON,
  vehiclesToGeoJSON,
  paintUnchanged,
  positionsUnchanged,
  type LayerKey,
  type PointCollection,
  type RouteOverlay,
  type VisibleItem,
  VISIBLE_LIMIT,
} from './mapData'
import type { MapCamera } from './mapCamera'

const FONT = ['Noto Sans Regular']

export type MapHit = { kind: 'vehicle' | 'stop' | 'rail'; id: string }
export type MapView = { center: { lat: number; lon: number }; zoom: number }

/** Warstwy klikalne, w kolejności pierwszeństwa, gdy pod palcem jest kilka obiektów. */
const HIT_LAYERS: { layer: string; kind: MapHit['kind'] }[] = [
  { layer: 'vehicles-arrows', kind: 'vehicle' },
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
  backbone: { type: 'FeatureCollection'; features: unknown[] }
  vehicles: PointCollection
  stops: PointCollection
  rail: PointCollection
  selected: PointCollection
  pinnedItems: PointCollection
  route: RouteOverlay
  routeColor: string
}

const EMPTY_ROUTE: RouteOverlay = { line: { type: 'FeatureCollection', features: [] }, stops: EMPTY, bounds: null }
/** Tryb linii przyciemnia wszystko poza trasą i jej pojazdami (spec §6). */
const DIMMABLE = ['rail-1', 'rail-2', 'rail-3', 'stops-busStops', 'stops-tramStops', 'stops-metroStops']
const DIM_OPACITY = 0.25
/** Przytrzymanie palca na mapie = „co jest w pobliżu" (odpowiednik prawego kliku). */
const LONG_PRESS_MS = 500
const VISIBLE_KIND: Record<string, VisibleItem['kind']> = { vehicles: 'vehicle', 'vehicles-arrows': 'vehicle', 'rail-1': 'rail', 'rail-2': 'rail', 'rail-3': 'rail' }

/** Płynny przejazd między odczytami (co 15 s): ~1 s, ~15 klatek. */
const GLIDE_MS = 1000
const GLIDE_FRAME_MS = 66
type GlideRun = { raf: number; target: PointCollection }

/** Świadome „skupienie" kamery (przelot do obiektu, korekta po zmianie paddingu): krótko, żeby arkusz i mapa jechały razem. */
const CAMERA_MS = 320
/**
 * Pomiary arkusza i pasków przychodzą seriami (animacja uchwytu, zmiana rozmiaru okna) — kamera rusza dopiero,
 * gdy wartości przestały się zmieniać, a nie przy każdej klatce.
 */
const INSET_SETTLE_MS = 120
/** Zapas między obiektem a krawędzią wolnego obszaru przy kadrowaniu trasy. */
const FIT_MARGIN = 16

/** Zasłonięte pasy mapy w px: u góry pasek wyszukiwania i filtry, u dołu arkusz (telefon). Szeroki ekran: dół 0. */
export type MapInsets = { top: number; bottom: number }
const NO_INSETS: MapInsets = { top: 0, bottom: 0 }

function cameraPadding({ top, bottom }: MapInsets) {
  return { top, bottom, left: 0, right: 0 }
}

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Jeden sposób ruszania kamerą na świadomy cel: `prefers-reduced-motion` = skok bez animacji, inaczej przelot (`fly`)
 * albo płynny przejazd, oba ≤ `CAMERA_MS`. `padding` przesuwa środek kadru w wolny obszar (nad arkusz, pod pasek).
 */
function moveCamera(map: MapLibreMap, target: { center: [number, number]; zoom?: number; padding: ReturnType<typeof cameraPadding> }, fly: boolean): void {
  if (prefersReducedMotion()) map.jumpTo(target)
  else if (fly) map.flyTo({ ...target, duration: CAMERA_MS })
  else map.easeTo({ ...target, duration: CAMERA_MS })
}

function backboneCollection(lines: BackboneLine[] | null): Data['backbone'] {
  return {
    type: 'FeatureCollection',
    features: (lines ?? []).map((l) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: l.points.map(([lat, lon]) => [lon, lat]) },
      // Kolor rodzaju z jednej palety (metro żółte, SKM niebieskie — jak plakietki `LineBadge`), nie `route_color` z feedu.
      properties: { color: MODE_COLOR[l.mode] },
    })),
  }
}

function selectedCollection(selected: { lat: number; lon: number; bearing?: number | null } | null): PointCollection {
  if (selected === null) return EMPTY
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [selected.lon, selected.lat] }, properties: selected.bearing == null ? {} : { bearing: selected.bearing } }] }
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
  // Obrys kropek i strzałek: reguła `strokeFor` (biały, pod żółtym metrem ciemnoczerwony) jako wyrażenie MapLibre.
  const strokeColor = strokeExpression() as never
  const stroke = { 'circle-stroke-color': strokeColor, 'circle-stroke-width': 1.5 }

  map.addSource('backbone', { type: 'geojson', data: data.backbone as never })
  map.addSource('rail', { type: 'geojson', data: data.rail })
  map.addSource('stops', { type: 'geojson', data: data.stops })
  map.addSource('vehicles', { type: 'geojson', data: data.vehicles })
  map.addSource('selected', { type: 'geojson', data: data.selected })
  map.addSource('pinnedItems', { type: 'geojson', data: data.pinnedItems })
  map.addSource('route-line', { type: 'geojson', data: data.route.line })
  map.addSource('route-stops', { type: 'geojson', data: data.route.stops })

  // Metro i kolej miejska jako cienkie tło — orientacja w mieście, zanim pokażą się przystanki.
  // Obwódka pod przebiegiem. Jasny podkład: biała (niebieska kolej), ale pod żółtym metrem ciemnoczerwona — żółć na bieli
  // jest niewidoczna. Ciemny podkład: zawsze biała półprzezroczysta (żółć sama kontrastuje; czerwona obwódka brudziła ją na pomarańcz).
  map.addLayer({
    id: 'backbone-casing',
    type: 'line',
    source: 'backbone',
    minzoom: 9,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': casingExpression(dark) as never, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4.5, 15, 8.5], 'line-opacity': dark ? 0.55 : 0.9 },
  })
  map.addLayer({
    id: 'backbone',
    type: 'line',
    source: 'backbone',
    minzoom: 9,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 15, 5], 'line-opacity': 0.9 },
  })

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
        'circle-stroke-color': strokeColor,
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
    id: 'route-casing',
    type: 'line',
    source: 'route-line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': casingFor(data.routeColor, dark), 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 10], 'line-opacity': dark ? 0.55 : 0.9 },
  })
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
      'circle-stroke-color': outlineFor(data.routeColor),
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
    filter: ['!', ['has', 'bearing']],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-opacity': ['get', 'opacity'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4.5, 16, 8],
      ...stroke,
    },
  })
  if (!map.hasImage('vehicle-arrow')) map.addImage('vehicle-arrow', arrowImage(), { sdf: true, pixelRatio: 3 })
  map.addLayer({
    id: 'vehicles-arrows',
    type: 'symbol',
    source: 'vehicles',
    filter: ['has', 'bearing'],
    layout: {
      'icon-image': 'vehicle-arrow',
      'icon-size': 22 / 16,
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
    },
    paint: { 'icon-color': ['get', 'color'], 'icon-opacity': ['get', 'opacity'], 'icon-halo-color': strokeColor, 'icon-halo-width': 1 },
  })
  map.addLayer({
    id: 'vehicles-labels',
    type: 'symbol',
    source: 'vehicles',
    minzoom: MAP_ZOOM.vehicleLabels,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, -1.3], 'text-anchor': 'bottom' },
    paint: labelPaint,
  })

  // Przypięte (Pulpit) — złota obwódka, widoczna przy każdym zoomie.
  map.addLayer({
    id: 'pinnedItems',
    type: 'circle',
    source: 'pinnedItems',
    paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 2.5 },
  })

  // Obwódka wybranego obiektu — BEZ minzoom: wynik wyszukiwania widać zawsze (spec §2).
  map.addLayer({
    id: 'selected',
    type: 'circle',
    source: 'selected',
    filter: ['!', ['has', 'bearing']],
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': dark ? '#a5b4fc' : '#4338ca',
      'circle-stroke-width': 3,
    },
  })

  map.addLayer({
    id: 'selected-heading',
    type: 'symbol',
    source: 'selected',
    filter: ['has', 'bearing'],
    layout: { 'icon-image': 'vehicle-arrow', 'icon-size': 28 / 16, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true },
    paint: { 'icon-color': dark ? '#a5b4fc' : '#4338ca', 'icon-halo-color': strokeColor, 'icon-halo-width': 1 },
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

/**
 * Kadr na trasę — z miejscem na pasek wyszukiwania u góry i na arkusz u dołu. `absolutePadding`: padding KAMERY zostaje
 * po każdym przelocie z `moveCamera`, a bez tej flagi MapLibre 6 dokładałby do niego margines kadru (górę liczyłoby dwa razy).
 */
function fitRoute(map: MapLibreMap, bounds: NonNullable<RouteOverlay['bounds']>, insets: MapInsets): void {
  map.fitBounds(bounds, {
    padding: { top: Math.max(150, insets.top + FIT_MARGIN), right: 40, bottom: Math.max(40, insets.bottom + FIT_MARGIN), left: 40 },
    absolutePadding: true,
    maxZoom: 15,
  })
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
  initialCamera,
  vehicles,
  backbone,
  stops,
  railStations,
  hidden,
  routeId,
  selected,
  focus,
  route,
  follow,
  pinnedItems = [],
  onlyLines = null,
  listOpen = false,
  insets = NO_INSETS,
  dark,
  onSelect,
  onViewChange,
  onUserMove,
  onContextPoint,
  onVisibleChange,
}: {
  ariaLabel: string
  /** Kadr startowy (centrum miasta albo `?at=` / ostatni widok). */
  initialCamera: MapCamera
  vehicles: CityVehicle[]
  /** Przebiegi metra/kolei miejskiej — tło; `null` = jeszcze nie ma. */
  backbone: BackboneLine[] | null
  stops: CityStop[] | null
  railStations: MapRailStation[] | null
  hidden: ReadonlySet<LayerKey>
  /** Wybrana linia — pokazujemy tylko jej pojazdy. */
  routeId: string | null
  /** Pozycja wybranego obiektu (obwódka). Pojazd: aktualizowana z każdym odczytem. */
  selected: { lat: number; lon: number; bearing?: number | null } | null
  /** Przelot kamery — nowy `nonce` = nowy przelot, także do tego samego miejsca. */
  focus: { lat: number; lon: number; nonce: number; zoom?: number } | null
  /** Tryb linii: przebieg wybranego kierunku; `key` zmienia się z linią/kierunkiem (nowy kadr). */
  route: { key: string; overlay: RouteOverlay; color: string } | null
  /** Śledzony pojazd — kamera przesuwa się za nim z każdym odczytem. */
  follow: { lat: number; lon: number } | null
  /** Pozycje przypiętych stacji/przystanków. */
  pinnedItems?: { lat: number; lon: number }[]
  /** „Tylko linie z utrudnieniami" — `null` = wszystkie. */
  onlyLines?: ReadonlySet<string> | null
  /** Lista „w widoku" otwarta — dopiero wtedy liczymy widoczne obiekty. */
  listOpen?: boolean
  /**
   * Pasy zasłonięte przez interfejs (`MapInsets`), zmierzone przez stronę i ustalone — nie z klatek animacji. Świadomy
   * przelot i wybrany obiekt trafiają do wolnego obszaru. Żyją w refach: zmiana NIE tworzy mapy od nowa.
   */
  insets?: MapInsets
  dark: boolean
  onSelect: (hit: MapHit | null) => void
  onViewChange?: (view: MapView) => void
  /** Użytkownik sam przesunął mapę — np. koniec śledzenia pojazdu. */
  onUserMove?: () => void
  /** Prawy klik / przytrzymanie palca — punkt dla „co jest w pobliżu". */
  onContextPoint?: (point: { lat: number; lon: number }) => void
  /** Obiekty w kadrze (gdy `listOpen`); `overflow` = było ich więcej niż limit. */
  onVisibleChange?: (items: VisibleItem[], overflow: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const dataRef = useRef<Data>({ backbone: backboneCollection(null), vehicles: EMPTY, stops: EMPTY, rail: EMPTY, selected: EMPTY, pinnedItems: EMPTY, route: EMPTY_ROUTE, routeColor: MODE_COLOR.bus })
  const dimmedRef = useRef(false)
  /** Kadr trasy wybranej, zanim styl mapy się wczytał — dopasujemy go po `style.load`. */
  const pendingFitRef = useRef<RouteOverlay['bounds']>(null)
  const pendingFocusRef = useRef<typeof focus>(null)
  const hiddenRef = useRef(hidden)
  const darkRef = useRef(dark)
  const onSelectRef = useRef(onSelect)
  const onViewChangeRef = useRef(onViewChange)
  const onUserMoveRef = useRef(onUserMove)
  const onContextPointRef = useRef(onContextPoint)
  const onVisibleChangeRef = useRef(onVisibleChange)
  const listOpenRef = useRef(listOpen)
  const insetsRef = useRef(insets)
  /** Pozycja wybranego obiektu — cel korekty kamery po zmianie insetów. */
  const selectedAtRef = useRef<{ lat: number; lon: number } | null>(null)
  /** Insety, z którymi kamera była ostatnio ustawiona (`null` = padding kamery pochodzi z kadru trasy, nie z insetów). */
  const appliedInsetsRef = useRef<MapInsets | null>(insets)
  /** Pozycje z ostatniego celu przejazdu (nie z ostatniej klatki) — punkt startu następnego płynnego przejazdu. */
  const drawnRef = useRef(new Map<string, [number, number]>())
  const lastVehiclesRef = useRef<CityVehicle[] | null>(null)
  /** Trwający płynny przejazd: kolejne klatki biorą `target` stąd, więc takt zegara może mu podmienić skład bez przerywania. */
  const glideRef = useRef<GlideRun | null>(null)
  useEffect(() => {
    onSelectRef.current = onSelect
    onViewChangeRef.current = onViewChange
    onUserMoveRef.current = onUserMove
    onContextPointRef.current = onContextPoint
    onVisibleChangeRef.current = onVisibleChange
    listOpenRef.current = listOpen
    insetsRef.current = insets
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
        center: [initialCamera.lon, initialCamera.lat],
        zoom: initialCamera.zoom,
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
      // `MapOptions` nie ma `padding`: kadr startowy (`?nearby=1`, `?at=`) ma stać w środku wolnego obszaru, a nie geometrycznym.
      // Padding ustawiamy przed pierwszym `moveend`, więc nie trafia do `onViewChange`.
      map.setPadding(cameraPadding(insetsRef.current))
      appliedInsetsRef.current = insetsRef.current
      map.touchZoomRotate.disableRotation()
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = map
      const mapInstance = map

      mapInstance.on('style.load', () => {
        addLayers(mapInstance, dataRef.current, hiddenRef.current, darkRef.current, dimmedRef.current)
        const pendingFocus = pendingFocusRef.current
        if (pendingFocus !== null) {
          moveCamera(mapInstance, { center: [pendingFocus.lon, pendingFocus.lat], zoom: pendingFocus.zoom ?? Math.max(mapInstance.getZoom(), MAP_ZOOM.focus), padding: cameraPadding(insetsRef.current) }, true)
          appliedInsetsRef.current = insetsRef.current
          pendingFocusRef.current = null
        } else if (pendingFitRef.current !== null) {
          fitRoute(mapInstance, pendingFitRef.current, insetsRef.current)
          appliedInsetsRef.current = null
        }
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
      let pressTimer: ReturnType<typeof setTimeout> | undefined
      const cancelPress = (): void => clearTimeout(pressTimer)
      mapInstance.on('contextmenu', (e) => onContextPointRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }))
      mapInstance.on('touchstart', (e) => {
        cancelPress()
        if (e.originalEvent.touches.length !== 1) return
        pressTimer = setTimeout(() => onContextPointRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }), LONG_PRESS_MS)
      })
      mapInstance.on('touchend', cancelPress)
      mapInstance.on('touchmove', cancelPress)
      // Po każdym dorysowaniu (ruch kamery, nowe dane) — tylko gdy lista jest otwarta.
      mapInstance.on('idle', () => {
        if (!listOpenRef.current) return
        const layers = ['vehicles', 'vehicles-arrows', 'rail-1', 'rail-2', 'rail-3', 'stops-metroStops', 'stops-tramStops', 'stops-busStops'].filter(
          (layer) => mapInstance.getLayer(layer) !== undefined
        )
        const seen = new Set<string>()
        const items: VisibleItem[] = []
        for (const feature of mapInstance.queryRenderedFeatures({ layers })) {
          const kind = VISIBLE_KIND[feature.layer.id] ?? 'stop'
          const id = String(feature.properties?.id)
          if (seen.has(`${kind}:${id}`)) continue
          seen.add(`${kind}:${id}`)
          items.push({ kind, id, label: String(feature.properties?.label ?? feature.properties?.name ?? '') })
        }
        onVisibleChangeRef.current?.(items.slice(0, VISIBLE_LIMIT), items.length > VISIBLE_LIMIT)
      })
      mapInstance.on('dragstart', () => {
        cancelPress()
        onUserMoveRef.current?.()
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
    const target = vehiclesToGeoJSON(vehicles, hidden, routeId, onlyLines)
    const previous = dataRef.current.vehicles
    dataRef.current.vehicles = target
    const reading = lastVehiclesRef.current !== null && lastVehiclesRef.current !== vehicles
    lastVehiclesRef.current = vehicles
    // Zegar wieku (`useCityVehicles`, co 10 s) podaje nową tablicę z tymi samymi punktami i, poza progiem wygaszenia/ukrycia
    // (`mapData`), tym samym obrazem: bez zmiany nie ma `setData` (ani `idle` z listą „W widoku"), a trwający przejazd biegnie dalej.
    if (paintUnchanged(previous, target)) return
    const source = mapRef.current?.getSource('vehicles') as GeoJSONSource | undefined
    const running = glideRef.current
    const from = drawnRef.current
    drawnRef.current = new Map(target.features.map((f) => [String(f.properties.id), f.geometry.coordinates]))
    if (running !== null && positionsUnchanged(previous, target)) {
      // Takt (postarzenie, ukrycie wygasłego, filtr) w trakcie przejazdu: nowy skład dostają kolejne klatki — bez przerwania i skoku do celu.
      running.target = target
      return
    }
    if (running !== null) {
      cancelAnimationFrame(running.raf)
      glideRef.current = null
    }
    // Płynnie tylko nowy ODCZYT pozycji — zmiana filtra/linii to skok, nie przejazd.
    const moved = target.features.some((f) => {
      const was = from.get(String(f.properties.id))
      return was !== undefined && (was[0] !== f.geometry.coordinates[0] || was[1] !== f.geometry.coordinates[1])
    })
    const glide = moved && reading && source !== undefined && !prefersReducedMotion()
    if (source === undefined) return
    if (!glide) {
      source.setData(target)
      return
    }
    const start = performance.now()
    let lastFrame = 0
    const run: GlideRun = { raf: 0, target }
    glideRef.current = run
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / GLIDE_MS)
      if (t === 1 || now - lastFrame >= GLIDE_FRAME_MS) {
        lastFrame = now
        source.setData(interpolatePoints(from, run.target, t))
      }
      if (t < 1) run.raf = requestAnimationFrame(step)
      else glideRef.current = null
    }
    run.raf = requestAnimationFrame(step)
    // ponytail: ~15 × setData całej warstwy na odczyt; przy >2 tys. pojazdów przejść na feature-state/shader.
  }, [vehicles, hidden, routeId, onlyLines])
  // Przejazdu nie przerywa kolejne uruchomienie efektu (takt zegara) — kończy go dopiero odmontowanie.
  useEffect(
    () => () => {
      if (glideRef.current !== null) cancelAnimationFrame(glideRef.current.raf)
    },
    []
  )

  const pinnedItemsKey = pinnedItems.map((f) => `${f.lat},${f.lon}`).join('|')
  useEffect(() => {
    dataRef.current.pinnedItems = {
      type: 'FeatureCollection',
      features: pinnedItems.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: {} })),
    }
    ;(mapRef.current?.getSource('pinnedItems') as GeoJSONSource | undefined)?.setData(dataRef.current.pinnedItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnatura pozycji, nie tożsamość tablicy z każdego renderu
  }, [pinnedItemsKey])

  useEffect(() => {
    // Otwarcie listy: przerysowanie wywoła `idle` → pierwsza lista od razu.
    if (listOpen) mapRef.current?.triggerRepaint()
  }, [listOpen])

  useEffect(() => {
    dataRef.current.backbone = backboneCollection(backbone)
    ;(mapRef.current?.getSource('backbone') as GeoJSONSource | undefined)?.setData(dataRef.current.backbone as never)
  }, [backbone])

  const followLat = follow?.lat
  const followLon = follow?.lon
  useEffect(() => {
    if (followLat === undefined || followLon === undefined) return
    // Z paddingiem insetów: śledzony pojazd zostaje w wolnym obszarze, a padding kamery jest znany (nie zostaje po kadrze trasy).
    mapRef.current?.easeTo({ center: [followLon, followLat], duration: GLIDE_MS, padding: cameraPadding(insetsRef.current) })
    appliedInsetsRef.current = insetsRef.current
  }, [followLat, followLon])

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
  const selectedBearing = selected?.bearing
  useEffect(() => {
    const at = selectedLat === undefined || selectedLon === undefined ? null : { lat: selectedLat, lon: selectedLon, bearing: selectedBearing }
    selectedAtRef.current = at
    dataRef.current.selected = selectedCollection(at)
    ;(mapRef.current?.getSource('selected') as GeoJSONSource | undefined)?.setData(dataRef.current.selected)
  }, [selectedLat, selectedLon, selectedBearing])

  // Zmiana insetów (arkusz zmienił wysokość, pasek urósł) przy wybranym obiekcie: łagodne przesunięcie, żeby obiekt został w
  // wolnym obszarze. Bez wyboru kamera stoi (padding dostanie przy następnym skupieniu); to samo, gdy przelot już go niósł.
  const insetTop = insets.top
  const insetBottom = insets.bottom
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const settle = (): void => {
      const map = mapRef.current
      const at = selectedAtRef.current
      const applied = appliedInsetsRef.current
      if (map === null || at === null || (applied !== null && applied.top === insetTop && applied.bottom === insetBottom)) return
      // Trwa przelot (np. skupienie ze starymi insetami, nowy arkusz zgłasza wysokość render później): `easeTo` przerwałby go
      // i zostawił pośredni zoom, więc czekamy na lądowanie i dopiero wtedy korygujemy sam padding.
      if (map.isMoving()) {
        timer = setTimeout(settle, INSET_SETTLE_MS)
        return
      }
      // Użytkownik odsunął mapę od wybranego obiektu — nie ciągniemy kamery z powrotem.
      if (!map.getBounds().contains([at.lon, at.lat])) return
      const next = { top: insetTop, bottom: insetBottom }
      appliedInsetsRef.current = next
      moveCamera(map, { center: [at.lon, at.lat], padding: cameraPadding(next) }, false)
    }
    timer = setTimeout(settle, INSET_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [insetTop, insetBottom])

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
    map.setPaintProperty('route-casing', 'line-color', casingFor(dataRef.current.routeColor, darkRef.current))
    map.setPaintProperty('route-stops', 'circle-stroke-color', outlineFor(dataRef.current.routeColor))
    applyDim(map, route !== null)
    const bounds = route?.overlay.bounds
    if (bounds !== null && bounds !== undefined) {
      fitRoute(map, bounds, insetsRef.current)
      appliedInsetsRef.current = null
    }
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
    pendingFocusRef.current = focus
    if (focus === null || mapRef.current === null) return
    const map = mapRef.current
    // Bez `zoom` = przybliż do obiektu (nigdy nie oddalaj); z `zoom` = dokładnie ten kadr („całe miasto").
    // Padding z insetów: obiekt ląduje w wolnym obszarze, nie pod arkuszem ani paskiem.
    moveCamera(map, { center: [focus.lon, focus.lat], zoom: focus.zoom ?? Math.max(map.getZoom(), MAP_ZOOM.focus), padding: cameraPadding(insetsRef.current) }, true)
    appliedInsetsRef.current = insetsRef.current
    pendingFocusRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- przelot tylko na nowy `nonce`, nie przy każdym renderze
  }, [focusNonce])

  return (
    // `--map-inset-bottom` unosi atrybucję MapLibre nad arkusz (`globals.css`, „Atrybucja nad arkuszem"); 0 bez arkusza.
    <div className="transit-map absolute inset-0" style={{ '--map-inset-bottom': `${insets.bottom}px` } as CSSProperties}>
      {/* Region z nazwą to canvas MapLibre (`Map.Title` wyżej) — drugi, zagnieżdżony byłby szumem dla czytnika. */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
