import { describe, expect, it } from 'vitest'
import { vehicleLatLon } from './vehiclePosition'

const STOPS = [
  { lat: 52, lon: 21 },
  { lat: 52.02, lon: 21.02 },
  { lat: 52.04, lon: 21.02 },
]

describe('vehicleLatLon', () => {
  it('interpolates between the stop before and after the vehicle', () => {
    const p = vehicleLatLon(STOPS, { afterStopOrder: 0, fraction: 0.5 })!
    expect(p.lat).toBeCloseTo(52.01)
    expect(p.lon).toBeCloseTo(21.01)
  })

  it('fraction 0 sits on the previous stop, 1 on the next', () => {
    expect(vehicleLatLon(STOPS, { afterStopOrder: 1, fraction: 0 })).toEqual({ lat: 52.02, lon: 21.02 })
    expect(vehicleLatLon(STOPS, { afterStopOrder: 1, fraction: 1 })).toEqual({ lat: 52.04, lon: 21.02 })
  })

  it('returns null when the route has no such segment (stale route vs vehicle direction)', () => {
    expect(vehicleLatLon(STOPS, { afterStopOrder: 2, fraction: 0.5 })).toBeNull()
    expect(vehicleLatLon([], { afterStopOrder: 0, fraction: 0 })).toBeNull()
  })

  it('returns null for non-finite coordinates', () => {
    expect(vehicleLatLon([{ lat: NaN, lon: 21 }, { lat: 52, lon: 21 }], { afterStopOrder: 0, fraction: 0.5 })).toBeNull()
  })
})
