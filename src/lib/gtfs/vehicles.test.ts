import { describe, expect, it } from 'vitest'
import { parseVehicleFeed } from './vehicles'

const good = {
  id: 'V/18/2',
  timestamp: '2026-09-04T08:57:36+02:00',
  lat: 52.18191,
  lon: 20.988758,
  side_number: '2094',
  trip_id: '2026-09-04:18:PtS:2:0903',
  bearing: -21.6,
}

describe('parseVehicleFeed', () => {
  it('maps a well-formed feed and keeps null bearing', () => {
    const r = parseVehicleFeed({ time: '2026-09-04T08:57:50+02:00', positions: [good, { ...good, bearing: null }] })
    expect(r.positions).toHaveLength(2)
    expect(r.positions[0]).toMatchObject({ tripId: good.trip_id, sideNumber: '2094', bearing: -21.6 })
    expect(r.positions[1].bearing).toBeNull()
    expect(r.droppedPositions).toBe(0)
    expect(r.feedTime).toBe('2026-09-04T08:57:50+02:00')
  })

  it('drops and counts rows missing trip_id / lat / lon', () => {
    const r = parseVehicleFeed({
      positions: [good, { ...good, trip_id: undefined }, { ...good, lat: undefined }, { id: 'x' }],
    })
    expect(r.positions).toHaveLength(1)
    expect(r.droppedPositions).toBe(3)
  })

  it('returns empty on a shape that is not the feed', () => {
    expect(parseVehicleFeed(null)).toEqual({ positions: [], droppedPositions: 0, feedTime: null })
    expect(parseVehicleFeed({ nope: 1 })).toEqual({ positions: [], droppedPositions: 0, feedTime: null })
  })
})
