import { describe, expect, it } from 'vitest'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import type { CityStop } from '@/lib/gtfs/query'
import {
  MODE_COLOR,
  UNKNOWN_COLOR,
  ageLabel,
  boundsContain,
  parseHidden,
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
    expect(feature.geometry.coordinates).toEqual([21.0, 52.2])
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

describe('stopsBounds / boundsContain / ageLabel', () => {
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

  it('formats position age', () => {
    expect(ageLabel(2)).toBe('przed chwilą')
    expect(ageLabel(13)).toBe('13 s temu')
    expect(ageLabel(150)).toBe('3 min temu')
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
