import type { CityStop, LineRouteDirection } from '@/lib/gtfs/query'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { MapRailStation } from '@/lib/weather/coordinates'

/**
 * Czysta warstwa danych mapy transportu: progi zoomu, kolory rodzajów, filtry
 * warstw (i ich zapis w URL-u), GeoJSON dla MapLibre. Bez DOM i bez MapLibre —
 * testowalna wprost. Wszystkie progi w jednym miejscu (spec §24).
 */

/** Od którego zoomu co widać. Wynik wyszukiwania (`selected`) widać zawsze. */
export const MAP_ZOOM = {
  min: 5,
  initial: 12,
  railTier2: 8,
  railTier3: 10,
  railLabelsMajor: 7,
  railLabels: 12,
  metroStops: 11,
  stops: 14,
  vehicleLabels: 15,
  stopLabels: 16,
  focus: 16,
} as const

/** ≈ Polska — kolej jest ogólnopolska, dalej nie ma czego pokazać. */
export const POLAND_BOUNDS: [[number, number], [number, number]] = [
  [13.0, 48.5],
  [25.0, 55.3],
]

/**
 * Kolor = RODZAJ środka transportu, nic więcej (spec §9): nie operator, nie
 * opóźnienie. Te same wartości w legendzie. Ciemne odcienie + biały obrys na
 * mapie — kontrast ≥ 3:1 do jasnego i ciemnego podkładu.
 */
export const MODE_COLOR: Record<GtfsMode, string> = {
  bus: '#15803d',
  tram: '#dc2626',
  metro: '#7c3aed',
  rail: '#2563eb',
  other: '#15803d',
}
export const UNKNOWN_COLOR = '#6b7280'

/** Warstwy przełączane w „Filtrach". Domyślnie wszystkie widoczne. */
export type LayerKey = 'rail' | 'metroStops' | 'tramStops' | 'busStops' | 'buses' | 'trams' | 'metro' | 'trains'

export const POINT_LAYERS: LayerKey[] = ['rail', 'metroStops', 'tramStops', 'busStops']
export const VEHICLE_LAYERS: LayerKey[] = ['buses', 'trams', 'metro', 'trains']

export const LAYER_LABEL: Record<LayerKey, string> = {
  rail: 'Stacje kolejowe',
  metroStops: 'Stacje metra',
  tramStops: 'Przystanki tramwajowe',
  busStops: 'Przystanki autobusowe',
  buses: 'Autobusy',
  trams: 'Tramwaje',
  metro: 'Metro',
  trains: 'Pociągi',
}

/** Rodzaj, którego kolor/ikonę pokazuje dana warstwa (legenda, filtry). */
export const LAYER_MODE: Record<LayerKey, GtfsMode> = {
  rail: 'rail',
  metroStops: 'metro',
  tramStops: 'tram',
  busStops: 'bus',
  buses: 'bus',
  trams: 'tram',
  metro: 'metro',
  trains: 'rail',
}

const ALL_KEYS = new Set<string>([...POINT_LAYERS, ...VEHICLE_LAYERS])

export function vehicleLayerKey(mode: GtfsMode | null): LayerKey {
  if (mode === 'tram') return 'trams'
  if (mode === 'metro') return 'metro'
  if (mode === 'rail') return 'trains'
  // Nieznany kurs (`mode: null`) i `other` — w Warszawie to praktycznie zawsze autobus.
  return 'buses'
}

export function stopLayerKey(mode: CityStop['mode']): LayerKey {
  if (mode === 'metro') return 'metroStops'
  if (mode === 'tram') return 'tramStops'
  return 'busStops'
}

/**
 * Ukryte warstwy z URL-a. `?hide=` (lista kluczy) + stare parametry sprzed
 * refaktoru, żeby zapisane linki działały dalej: `?vehicles=0`, `?rail=0`,
 * `?mode=<tryb>` (pokaż tylko ten rodzaj pojazdów). Nieznane wartości po cichu
 * ignorowane (AGENTS.md #4).
 */
export function parseHidden(read: (name: string) => string | null): Set<LayerKey> {
  const hidden = new Set<LayerKey>()
  for (const part of (read('hide') ?? '').split(',')) {
    if (ALL_KEYS.has(part)) hidden.add(part as LayerKey)
  }
  if (read('vehicles') === '0') VEHICLE_LAYERS.forEach((key) => hidden.add(key))
  if (read('rail') === '0') hidden.add('rail')
  const mode = read('mode')
  if (mode === 'bus' || mode === 'tram' || mode === 'metro' || mode === 'rail') {
    const keep = vehicleLayerKey(mode)
    VEHICLE_LAYERS.forEach((key) => {
      if (key !== keep) hidden.add(key)
    })
  }
  return hidden
}

/** `null` = nic nie ukryte (parametr znika z URL-a). Kolejność stała — ten sam stan, ten sam URL. */
export function serializeHidden(hidden: ReadonlySet<LayerKey>): string | null {
  const keys = [...POINT_LAYERS, ...VEHICLE_LAYERS].filter((key) => hidden.has(key))
  return keys.length === 0 ? null : keys.join(',')
}

type Point = { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Record<string, string | number> }
export type PointCollection = { type: 'FeatureCollection'; features: Point[] }

const point = (lon: number, lat: number, properties: Point['properties']): Point => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
})

/** Wygaszanie zaczyna się w tej sekundzie wieku pozycji, kończy (ukrycie) w `HIDE_AFTER_SEC`. */
export const FADE_START_SEC = 90
export const HIDE_AFTER_SEC = 180

/**
 * Pojazdy → GeoJSON. Filtry (ukryte rodzaje, wybrana linia) stosowane TU, na
 * danych — warstwa pojazdów i tak dostaje `setData` co 15 s. Pozycje starsze
 * niż `HIDE_AFTER_SEC` znikają (martwa pozycja, nie „brak danych").
 */
export function vehiclesToGeoJSON(
  vehicles: CityVehicle[],
  hidden: ReadonlySet<LayerKey>,
  routeId: string | null,
  /** „Tylko linie z utrudnieniami" — numery linii z aktywnym alertem; `null` = bez tego filtra. */
  onlyLines: ReadonlySet<string> | null = null
): PointCollection {
  const features: Point[] = []
  for (const v of vehicles) {
    if (v.ageSec > HIDE_AFTER_SEC) continue
    if (hidden.has(vehicleLayerKey(v.mode))) continue
    if (routeId !== null && v.routeId !== routeId) continue
    if (onlyLines !== null && (v.shortName === null || !onlyLines.has(v.shortName))) continue
    const opacity = v.ageSec <= FADE_START_SEC ? 1 : 1 - (v.ageSec - FADE_START_SEC) / (HIDE_AFTER_SEC - FADE_START_SEC)
    features.push(
      point(v.lon, v.lat, {
        id: v.id,
        color: v.mode !== null ? MODE_COLOR[v.mode] : UNKNOWN_COLOR,
        opacity: Math.round(opacity * 100) / 100,
        label: v.shortName ?? '',
        // Brak klucza = feed nie podał kierunku jazdy → bez strzałki (warstwa filtruje `has`).
        ...(v.bearing !== null ? { bearing: v.bearing } : {}),
      })
    )
  }
  return { type: 'FeatureCollection', features }
}

export function stopsToGeoJSON(stops: CityStop[]): PointCollection {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) =>
      point(s.lon, s.lat, { id: s.id, layer: stopLayerKey(s.mode), color: MODE_COLOR[s.mode], label: s.code !== null && !s.name.endsWith(s.code) ? `${s.name} ${s.code}` : s.name })
    ),
  }
}

export function railToGeoJSON(stations: MapRailStation[]): PointCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => point(s.lon, s.lat, { id: s.id, name: s.name, tier: s.tier })),
  }
}

/** Czy punkt leży w prostokącie [[zachód, południe], [wschód, północ]]. */
export function boundsContain(bounds: [[number, number], [number, number]], lon: number, lat: number): boolean {
  return lon >= bounds[0][0] && lon <= bounds[1][0] && lat >= bounds[0][1] && lat <= bounds[1][1]
}

/** Prostokąt obejmujący wszystkie przystanki — „obszar feedu miejskiego". `null` dla pustej listy. */
export function stopsBounds(stops: CityStop[]): [[number, number], [number, number]] | null {
  if (stops.length === 0) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const s of stops) {
    west = Math.min(west, s.lon)
    east = Math.max(east, s.lon)
    south = Math.min(south, s.lat)
    north = Math.max(north, s.lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}

/** Wiek pozycji po ludzku: „przed chwilą", „13 s temu", „2 min temu". */
export function ageLabel(ageSec: number): string {
  if (ageSec < 5) return 'przed chwilą'
  return ageSec < 60 ? `${ageSec} s temu` : `${Math.round(ageSec / 60)} min temu`
}

type Bounds = [[number, number], [number, number]]
export type RouteOverlay = {
  line: { type: 'FeatureCollection'; features: { type: 'Feature'; geometry: { type: 'LineString'; coordinates: [number, number][] }; properties: Record<string, never> }[] }
  stops: PointCollection
  bounds: Bounds | null
}

/**
 * Tryb linii: przebieg jednego kierunku jako linia (kształt `shapes.txt`,
 * a gdy go brak — łamana po przystankach, jak na stronie linii) + kropki
 * przystanków z nazwą. `bounds` = kadr do `fitBounds`.
 */
export function routeOverlay(direction: LineRouteDirection): RouteOverlay {
  const path: [number, number][] =
    direction.shape !== null && direction.shape.length >= 2
      ? direction.shape.map(([lat, lon]) => [lon, lat])
      : direction.stops.map((s) => [s.lon, s.lat])
  let bounds: Bounds | null = null
  for (const [lon, lat] of path) {
    bounds =
      bounds === null
        ? [
            [lon, lat],
            [lon, lat],
          ]
        : [
            [Math.min(bounds[0][0], lon), Math.min(bounds[0][1], lat)],
            [Math.max(bounds[1][0], lon), Math.max(bounds[1][1], lat)],
          ]
  }
  return {
    line: { type: 'FeatureCollection', features: path.length >= 2 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} }] : [] },
    stops: {
      type: 'FeatureCollection',
      features: direction.stops.map((s) => point(s.lon, s.lat, { id: s.stopId, label: s.code !== null && !s.name.endsWith(s.code) ? `${s.name} ${s.code}` : s.name })),
    },
    bounds,
  }
}

/**
 * Klatka płynnego przejazdu: pojazdy obecne w poprzednim odczycie jadą od
 * starej pozycji do nowej (`t` 0→1), nowe pojawiają się od razu na miejscu.
 */
export function interpolatePoints(from: ReadonlyMap<string, [number, number]>, to: PointCollection, t: number): PointCollection {
  return {
    type: 'FeatureCollection',
    features: to.features.map((feature) => {
      const start = from.get(String(feature.properties.id))
      if (start === undefined || t >= 1) return feature
      const [lon, lat] = feature.geometry.coordinates
      return { ...feature, geometry: { type: 'Point', coordinates: [start[0] + (lon - start[0]) * t, start[1] + (lat - start[1]) * t] } }
    }),
  }
}

/**
 * Strzałka kierunku jazdy jako obraz SDF (kolor nadaje warstwa `icon-color`).
 * Piksele liczone wprost — bez canvasu, działa także w testach.
 */
export function arrowImage(size = 16): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    // Trójkąt ostrzem do góry: szerokość rośnie liniowo od wierzchołka.
    const half = ((y + 1) / size) * (size / 2)
    for (let x = 0; x < size; x += 1) {
      if (Math.abs(x + 0.5 - size / 2) <= half) data[(y * size + x) * 4 + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

export type MapCamera = { lat: number; lon: number; zoom: number }

/** `?at=lat,lon,zoom` → kadr; poza Polską / zły format = `null` (po cichu, AGENTS.md #4). */
export function parseAt(value: string | null): MapCamera | null {
  if (value === null) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [lat, lon, zoom] = parts
  if (!boundsContain(POLAND_BOUNDS, lon, lat) || zoom < MAP_ZOOM.min || zoom > 19) return null
  return { lat, lon, zoom }
}

/** Kadr → `?at=` (5 miejsc ≈ 1 m, zoom do 0,1). */
export function formatAt(camera: MapCamera): string {
  return `${camera.lat.toFixed(5)},${camera.lon.toFixed(5)},${camera.zoom.toFixed(1)}`
}

/** Odległość po powierzchni Ziemi w metrach (haversine). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export type NearbyPoint =
  | { kind: 'rail'; id: string; name: string; lat: number; lon: number; distanceM: number }
  | { kind: 'stop'; stop: CityStop; distanceM: number }

/**
 * „Co jest w pobliżu" punktu na mapie — stacje i przystanki w promieniu,
 * od najbliższego. Liniowo po listach, które klient i tak ma (~7 tys. + ~3 tys.).
 */
export function nearbyPoints(
  point: { lat: number; lon: number },
  stops: CityStop[],
  stations: MapRailStation[],
  radiusM = 500,
  limit = 8
): NearbyPoint[] {
  const found: NearbyPoint[] = []
  for (const stop of stops) {
    const d = distanceM(point, stop)
    if (d <= radiusM) found.push({ kind: 'stop', stop, distanceM: d })
  }
  for (const station of stations) {
    const d = distanceM(point, station)
    if (d <= radiusM) found.push({ kind: 'rail', id: station.id, name: station.name, lat: station.lat, lon: station.lon, distanceM: d })
  }
  return found.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit)
}

/** Punkt widoczny w kadrze — wiersz listy „w widoku". */
export type VisibleItem = { kind: 'vehicle' | 'stop' | 'rail'; id: string; label: string }
export const VISIBLE_LIMIT = 100
