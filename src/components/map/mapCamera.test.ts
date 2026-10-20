import { describe, expect, it } from 'vitest'
import type { CityStop } from '@/lib/gtfs/query'
import { distanceM, formatAt, isNearViewPoint, nearbyPoints, parseAt } from './mapCamera'

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

describe('isNearViewPoint (privacy radius in screen pixels)', () => {
  const user = { lat: 52.2301, lon: 21.0101 }
  const metresNorth = (m: number) => ({ lat: user.lat + m / 111_320, lon: user.lon })

  it('treats 40-55 m at z16 (a zoom gesture off-centre by 100-150 px) as near', () => {
    expect(isNearViewPoint(metresNorth(40), 16, user)).toBe(true)
    expect(isNearViewPoint(metresNorth(55), 16, user)).toBe(true)
  })

  it('the radius shrinks in metres as the zoom grows and grows as it falls (always ~150 px)', () => {
    expect(isNearViewPoint(metresNorth(500), 16, user)).toBe(false) // 150 px at z16 is ~220 m
    expect(isNearViewPoint(metresNorth(500), 13, user)).toBe(true) // 150 px at z13 is ~1.8 km
  })

  it('a point far away is not near at any sensible zoom', () => {
    expect(isNearViewPoint({ lat: 52.3, lon: 21.1 }, 12, user)).toBe(false)
  })
})
