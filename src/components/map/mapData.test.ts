import { describe, expect, it } from 'vitest'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { CityStop } from '@/lib/gtfs/query'
import { LINE_PALETTE, lineColor } from '../transitMode'
import {
  MODE_COLOR,
  UNKNOWN_COLOR,
  boundsContain,
  arrowImage,
  distanceM,
  nearbyPoints,
  formatAt,
  interpolatePoints,
  parseAt,
  parseHidden,
  strokeFor,
  casingFor,
  outlineFor,
  outlineFilter,
  strokeExpression,
  routeOverlay,
  railToGeoJSON,
  serializeHidden,
  stopsBounds,
  stopsToGeoJSON,
  vehiclesToGeoJSON,
  type LayerKey,
} from './mapData'

const reader = (params: Record<string, string>) => (name: string) => params[name] ?? null

function vehicle(over: Partial<CityVehicle> = {}): CityVehicle {
  return {
    id: 'v1', lat: 52.2, lon: 21.0, bearing: null, sideNumber: '1', ageSec: 5, headsign: 'Centrum',
    routeId: '20', shortName: '20', mode: 'tram', color: '#009944', directionId: 0, nextStop: null, ...over,
  }
}

describe('parseHidden / serializeHidden', () => {
  it('reads ?hide=, ignoring unknown keys', () => {
    expect([...parseHidden(reader({ hide: 'busStops,nope,trams' }))]).toEqual(['busStops', 'trams'])
  })

  it('keeps old links working: ?vehicles=0, ?rail=0, ?mode=', () => {
    expect([...parseHidden(reader({ vehicles: '0', rail: '0' }))].sort()).toEqual(['buses', 'metro', 'rail', 'trains', 'trams'])
    expect([...parseHidden(reader({ mode: 'tram' }))].sort()).toEqual(['buses', 'metro', 'trains'])
    expect(parseHidden(reader({ mode: '<script>' })).size).toBe(0)
  })

  it('serializes in a stable order and drops the param when nothing is hidden', () => {
    expect(serializeHidden(new Set<LayerKey>(['trams', 'rail']))).toBe('rail,trams')
    expect(serializeHidden(new Set())).toBeNull()
  })
})

describe('vehiclesToGeoJSON', () => {
  it('colours by mode, not by route colour, and labels with the line number', () => {
    const [feature] = vehiclesToGeoJSON([vehicle()], new Set(), null).features
    expect(feature.properties).toEqual({ id: 'v1', color: MODE_COLOR.tram, opacity: 1, label: '20' })
    expect(vehiclesToGeoJSON([vehicle({ bearing: -110 })], new Set(), null).features[0].properties.bearing).toBe(-110)
    expect(feature.geometry.coordinates).toEqual([21.0, 52.2])
  })

  it('a bus takes the colour of its line kind (derived from the line number), like its badge', () => {
    const night = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: 'N32' })], new Set(), null).features[0]
    const zone = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: '727' })], new Set(), null).features[0]
    const regular = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: '131' })], new Set(), null).features[0]
    expect(night.properties.color).toBe(LINE_PALETTE.night.bg)
    expect(zone.properties.color).toBe(LINE_PALETTE.zone.bg)
    expect(regular.properties.color).toBe(MODE_COLOR.bus)
  })

  it('greys out a vehicle of an unknown trip but keeps it on the map', () => {
    const [feature] = vehiclesToGeoJSON([vehicle({ mode: null, shortName: null, routeId: null })], new Set(), null).features
    expect(feature.properties.color).toBe(UNKNOWN_COLOR)
    expect(feature.properties.label).toBe('')
  })

  it('fades between 90 and 180 s and drops older positions', () => {
    const features = vehiclesToGeoJSON(
      [vehicle({ id: 'a', ageSec: 135 }), vehicle({ id: 'b', ageSec: 181 })],
      new Set(),
      null
    ).features
    expect(features.map((f) => [f.properties.id, f.properties.opacity])).toEqual([['a', 0.5]])
  })

  it('keeps only lines with disruptions when asked', () => {
    const vehicles = [vehicle({ id: 'a', shortName: '20' }), vehicle({ id: 'b', shortName: '9' }), vehicle({ id: 'c', shortName: null })]
    expect(vehiclesToGeoJSON(vehicles, new Set(), null, new Set(['9'])).features.map((f) => f.properties.id)).toEqual(['b'])
  })

  it('applies hidden modes and the selected line', () => {
    const vehicles = [vehicle({ id: 'tram' }), vehicle({ id: 'bus', mode: 'bus', routeId: '128' })]
    expect(vehiclesToGeoJSON(vehicles, new Set<LayerKey>(['trams']), null).features.map((f) => f.properties.id)).toEqual(['bus'])
    expect(vehiclesToGeoJSON(vehicles, new Set(), '128').features.map((f) => f.properties.id)).toEqual(['bus'])
  })
})

describe('stopsToGeoJSON / railToGeoJSON', () => {
  it('tags each stop with its filter layer and a label with the post code', () => {
    const stops: CityStop[] = [
      { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' },
      { id: '7014M', groupId: '7014M', name: 'Świętokrzyska', code: null, lat: 52.23, lon: 21.0, mode: 'metro' },
      { id: '100102', groupId: '1001', name: 'Centrum 02', code: '02', lat: 52.23, lon: 21.01, mode: 'tram' },
    ]
    expect(stopsToGeoJSON(stops).features.map((f) => f.properties)).toEqual([
      { id: '100101', layer: 'busStops', color: MODE_COLOR.bus, label: 'Centrum 01' },
      { id: '7014M', layer: 'metroStops', color: MODE_COLOR.metro, label: 'Świętokrzyska' },
      { id: '100102', layer: 'tramStops', color: MODE_COLOR.tram, label: 'Centrum 02' },
    ])
  })

  it('carries rail tier for zoom-dependent layers', () => {
    const [feature] = railToGeoJSON([{ id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 }]).features
    expect(feature.properties).toEqual({ id: '33605', name: 'Warszawa Centralna', tier: 1 })
  })
})

describe('stopsBounds / boundsContain', () => {
  it('computes the feed area and tests points against it', () => {
    const bounds = stopsBounds([
      { id: 'a', groupId: 'a', name: 'A', code: null, lat: 52.0, lon: 20.8, mode: 'bus' },
      { id: 'b', groupId: 'b', name: 'B', code: null, lat: 52.4, lon: 21.3, mode: 'bus' },
    ])
    expect(bounds).toEqual([[20.8, 52.0], [21.3, 52.4]])
    expect(boundsContain(bounds!, 21.0, 52.2)).toBe(true)
    expect(boundsContain(bounds!, 19.46, 51.76)).toBe(false)
    expect(stopsBounds([])).toBeNull()
  })
})

describe('routeOverlay', () => {
  const stop = (stopId: string, lat: number, lon: number) => ({
    stopId, groupId: stopId, name: `P${stopId}`, code: null, street: null, wheelchair: 0 as const, lat, lon, offsetSec: 0, onRequest: false,
  })
  const direction = { directionId: 0, headsign: 'B', origin: 'A', departures: [], stops: [stop('a', 52.0, 21.0), stop('b', 52.2, 21.3)] }

  it('draws the shapes.txt contour when present and frames it', () => {
    const overlay = routeOverlay({ ...direction, shape: [[52.0, 21.0], [52.1, 20.9], [52.2, 21.3]] })
    expect(overlay.line.features[0].geometry.coordinates).toEqual([[21.0, 52.0], [20.9, 52.1], [21.3, 52.2]])
    expect(overlay.bounds).toEqual([[20.9, 52.0], [21.3, 52.2]])
    expect(overlay.stops.features.map((f) => f.properties)).toEqual([{ id: 'a', label: 'Pa' }, { id: 'b', label: 'Pb' }])
  })

  it('falls back to a polyline through the stops without a shape', () => {
    const overlay = routeOverlay({ ...direction, shape: null })
    expect(overlay.line.features[0].geometry.coordinates).toEqual([[21.0, 52.0], [21.3, 52.2]])
  })

  it('has no line and no frame for an empty pattern', () => {
    const overlay = routeOverlay({ ...direction, stops: [], shape: null })
    expect(overlay.line.features).toEqual([])
    expect(overlay.bounds).toBeNull()
  })
})

describe('interpolatePoints', () => {
  const to = vehiclesToGeoJSON([vehicle({ id: 'a', lon: 21.2, lat: 52.2 }), vehicle({ id: 'new', lon: 21.5, lat: 52.5 })], new Set(), null)
  it('moves known vehicles part of the way and places new ones directly', () => {
    const frame = interpolatePoints(new Map([['a', [21.0, 52.0]]]), to, 0.5)
    expect(frame.features[0].geometry.coordinates[0]).toBeCloseTo(21.1)
    expect(frame.features[0].geometry.coordinates[1]).toBeCloseTo(52.1)
    expect(frame.features[1].geometry.coordinates).toEqual([21.5, 52.5])
    expect(interpolatePoints(new Map([['a', [21.0, 52.0]]]), to, 1)).toEqual(to)
  })
})

describe('arrowImage', () => {
  it('is an opaque upward triangle: narrow tip, full-width base', () => {
    const { width, data } = arrowImage(8)
    const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3]
    expect(alpha(0, 0)).toBe(0)
    expect(alpha(4, 0)).toBe(255)
    expect(alpha(0, 7)).toBe(255)
  })
})

describe('parseAt / formatAt', () => {
  it('round-trips a camera and rejects junk or places outside Poland', () => {
    expect(parseAt(formatAt({ lat: 52.2297, lon: 21.0122, zoom: 14.25 }))).toEqual({ lat: 52.2297, lon: 21.0122, zoom: 14.3 })
    expect(parseAt('52.2,21.0')).toBeNull()
    expect(parseAt('abc,21,12')).toBeNull()
    expect(parseAt('48.85,2.35,12')).toBeNull()
    expect(parseAt('52.2,21.0,40')).toBeNull()
    expect(parseAt(null)).toBeNull()
  })
})

describe('distanceM / nearbyPoints', () => {
  it('measures metres on the globe', () => {
    expect(distanceM({ lat: 52.2297, lon: 21.0122 }, { lat: 52.2297, lon: 21.0122 })).toBe(0)
    // ~111 m na 0,001° szerokości.
    expect(distanceM({ lat: 52.0, lon: 21.0 }, { lat: 52.001, lon: 21.0 })).toBeCloseTo(111.2, 0)
  })

  it('lists stops and stations within the radius, nearest first', () => {
    const near: CityStop = { id: 'n', groupId: 'n', name: 'Blisko', code: null, lat: 52.0005, lon: 21.0, mode: 'bus' }
    const far: CityStop = { id: 'f', groupId: 'f', name: 'Daleko', code: null, lat: 52.02, lon: 21.0, mode: 'bus' }
    const station = { id: '1', name: 'Stacja', lat: 52.0002, lon: 21.0, tier: 1 as const }
    const result = nearbyPoints({ lat: 52.0, lon: 21.0 }, [far, near], [station])
    expect(result.map((r) => (r.kind === 'stop' ? r.stop.id : r.id))).toEqual(['1', 'n'])
    expect(nearbyPoints({ lat: 52.0, lon: 21.0 }, [near], [station], 500, 1)).toHaveLength(1)
  })
})

describe('MODE_COLOR / strokeFor', () => {
  it('MODE_COLOR is the regular-line colour of each mode from the one palette', () => {
    for (const mode of ['metro', 'tram', 'bus', 'rail', 'other'] as const) {
      expect(MODE_COLOR[mode]).toBe(lineColor(mode, 'regular').bg)
    }
  })

  it('outline is white, except for yellow metro that would vanish on a light basemap', () => {
    expect(strokeFor(MODE_COLOR.tram)).toBe('#ffffff')
    expect(strokeFor(MODE_COLOR.metro)).toBe(LINE_PALETTE.metro.fg)
  })

  it('casing follows the basemap: white on dark for every line, the outline rule on light', () => {
    expect(casingFor(MODE_COLOR.metro, true)).toBe('#ffffff')
    expect(casingFor(MODE_COLOR.metro, false)).toBe(LINE_PALETTE.metro.fg)
    expect(casingFor(MODE_COLOR.rail, false)).toBe('#ffffff')
  })

  it('route-stop ring keeps the line colour, except yellow metro, which takes the outline colour', () => {
    expect(outlineFor(MODE_COLOR.tram)).toBe(MODE_COLOR.tram)
    expect(outlineFor(MODE_COLOR.metro)).toBe(LINE_PALETTE.metro.fg)
  })

  it('the MapLibre stroke expression is built from the same rule', () => {
    expect(strokeExpression()).toEqual(['match', ['get', 'color'], MODE_COLOR.metro, strokeFor(MODE_COLOR.metro), strokeFor(MODE_COLOR.tram)])
  })

  it('outlineFilter gives a 4-direction outline in the stroke colour (DOM/CSS arrows)', () => {
    const filter = outlineFilter(MODE_COLOR.metro)
    expect(filter.match(/drop-shadow/g)).toHaveLength(4)
    expect(filter).toContain(LINE_PALETTE.metro.fg)
  })
})
