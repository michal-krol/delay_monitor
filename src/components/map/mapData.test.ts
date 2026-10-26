import { describe, expect, it } from 'vitest'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { CityStop } from '@/lib/gtfs/query'
import { LINE_PALETTE, lineColor } from '../transitMode'
import {
  MODE_COLOR,
  FADE_START_SEC,
  HIDE_AFTER_SEC,
  paintUnchanged,
  positionsUnchanged,
  activeFilterCount,
  UNKNOWN_COLOR,
  boundsContain,
  arrowImage,
  interpolatePoints,
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
    routeId: '20', shortName: '20', mode: 'tram', kind: 'regular', directionId: 0, nextStop: null, ...over,
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

describe('activeFilterCount', () => {
  it('filter count = hidden + line + alerts', () => {
    expect(activeFilterCount({ hidden: new Set(), line: false, alertsOnly: false })).toBe(0)
    expect(activeFilterCount({ hidden: new Set<LayerKey>(['busStops', 'trams']), line: false, alertsOnly: false })).toBe(2)
    expect(activeFilterCount({ hidden: new Set<LayerKey>(['busStops', 'trams']), line: true, alertsOnly: true })).toBe(4)
    expect(activeFilterCount({ hidden: new Set(), line: true, alertsOnly: false })).toBe(1)
  })
})

describe('vehiclesToGeoJSON', () => {
  it('colours by mode, not by route colour, and labels with the line number', () => {
    const [feature] = vehiclesToGeoJSON([vehicle()], new Set(), null).features
    expect(feature.properties).toEqual({ id: 'v1', color: MODE_COLOR.tram, opacity: 1, label: '20' })
    expect(vehiclesToGeoJSON([vehicle({ bearing: -110 })], new Set(), null).features[0].properties.bearing).toBe(-110)
    expect(feature.geometry.coordinates).toEqual([21.0, 52.2])
  })

  it('a bus takes the colour of its served line kind, not one re-derived from the number', () => {
    const night = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: '131', kind: 'night' })], new Set(), null).features[0]
    const zone = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: '727', kind: 'zone' })], new Set(), null).features[0]
    const regular = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: '131', kind: 'regular' })], new Set(), null).features[0]
    expect(night.properties.color).toBe(LINE_PALETTE.night.bg)
    expect(zone.properties.color).toBe(LINE_PALETTE.zone.bg)
    expect(regular.properties.color).toBe(MODE_COLOR.bus)
  })

  it('falls back to the line number when the kind is missing — never a silent regular', () => {
    const night = vehiclesToGeoJSON([vehicle({ mode: 'bus', shortName: 'N32', kind: null })], new Set(), null).features[0]
    expect(night.properties.color).toBe(LINE_PALETTE.night.bg)
  })

  it('greys out a vehicle of an unknown trip but keeps it on the map', () => {
    const [feature] = vehiclesToGeoJSON([vehicle({ mode: null, kind: null, shortName: null, routeId: null })], new Set(), null).features
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

  it('vehicle age 91s is faded, 181s is hidden', () => {
    const features = vehiclesToGeoJSON(
      [vehicle({ id: 'fresh', ageSec: 90 }), vehicle({ id: 'faded', ageSec: 91 }), vehicle({ id: 'edge', ageSec: 180 }), vehicle({ id: 'gone', ageSec: 181 })],
      new Set(),
      null
    ).features
    const opacity = Object.fromEntries(features.map((f) => [f.properties.id, f.properties.opacity]))
    expect(opacity.fresh).toBe(1)
    expect(opacity.faded).toBeLessThan(1)
    expect(opacity.faded).toBeGreaterThan(0.9)
    expect(opacity.edge).toBe(0)
    expect(opacity).not.toHaveProperty('gone')
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

describe('paintUnchanged / positionsUnchanged (the 10 s age clock hands the map a new array every tick)', () => {
  const build = (vehicles: CityVehicle[]) => vehiclesToGeoJSON(vehicles, new Set(), null)

  it('a re-aged reading that stays fully opaque paints identically (no setData needed)', () => {
    expect(paintUnchanged(build([vehicle({ ageSec: 5 })]), build([vehicle({ ageSec: 15 })]))).toBe(true)
    expect(paintUnchanged(build([vehicle({ ageSec: FADE_START_SEC })]), build([vehicle({ ageSec: 5 })]))).toBe(true)
  })

  it('the opacity step, a hidden vehicle, a move and a different list each change the paint', () => {
    const fresh = build([vehicle()])
    expect(paintUnchanged(fresh, build([vehicle({ ageSec: FADE_START_SEC + 10 })]))).toBe(false)
    expect(paintUnchanged(fresh, build([vehicle({ ageSec: HIDE_AFTER_SEC + 1 })]))).toBe(false)
    expect(paintUnchanged(fresh, build([vehicle({ lon: 21.1 })]))).toBe(false)
    expect(paintUnchanged(fresh, build([vehicle(), vehicle({ id: 'v2' })]))).toBe(false)
    expect(paintUnchanged(fresh, build([vehicle({ id: 'other' })]))).toBe(false)
    expect(paintUnchanged(fresh, build([vehicle({ bearing: 90 })]))).toBe(false)
  })

  it('positionsUnchanged tolerates paint changes, removals and arrivals but not a moved vehicle', () => {
    const before = build([vehicle({ id: 'a' }), vehicle({ id: 'b' })])
    expect(positionsUnchanged(before, build([vehicle({ id: 'a', ageSec: FADE_START_SEC + 30 }), vehicle({ id: 'b' })]))).toBe(true)
    expect(positionsUnchanged(before, build([vehicle({ id: 'a', ageSec: HIDE_AFTER_SEC + 1 }), vehicle({ id: 'b' })]))).toBe(true)
    expect(positionsUnchanged(before, build([vehicle({ id: 'a' }), vehicle({ id: 'b' }), vehicle({ id: 'c', lon: 21.3 })]))).toBe(true)
    expect(positionsUnchanged(before, build([vehicle({ id: 'a', lon: 21.1 }), vehicle({ id: 'b' })]))).toBe(false)
  })
})

describe('arrowImage', () => {
  it('encodes the Lucide arrow as a signed distance field, with a notched base', () => {
    const { width, data } = arrowImage(24)
    const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3]
    expect(alpha(0, 0)).toBe(0)
    expect(alpha(12, 7)).toBeGreaterThan(191) // ostrze
    expect(alpha(7, 18)).toBeGreaterThan(191) // lewe skrzydło
    expect(alpha(12, 18)).toBeLessThan(191) // wcięcie podstawy
    expect([...data].some((value, index) => index % 4 === 3 && value > 0 && value < 255)).toBe(true)
  })

  it('pads the distance field so edges and outlines are not clipped', () => {
    const { width, data } = arrowImage()
    const alpha = (x: number, y: number) => data[(y * width + x) * 4 + 3]
    for (let x = 0; x < width; x += 1) {
      expect(alpha(x, 0)).toBeLessThan(191)
      expect(alpha(x, width - 1)).toBeLessThan(191)
    }
  })

  it('supplies a high resolution image for DPR 1, 2 and 3 displays', () => {
    expect(arrowImage()).toMatchObject({ width: 64, height: 64 })
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

