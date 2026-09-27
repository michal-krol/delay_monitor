import { describe, expect, it } from 'vitest'
import { railStationStatus } from './railStationStatus'
import type { BoardSnapshot } from './transform'

const NOW = Date.parse('2026-09-26T12:00:00Z')
const row = (minutes: number, over: Record<string, unknown> = {}) => ({
  plannedAt: new Date(NOW + minutes * 60_000).toISOString(),
  headsign: 'Kutno',
  delayMinutes: 4,
  status: 'delayed',
  trainLabel: 'IC 1234',
  carrier: 'IC',
  platform: '3',
  track: '8',
  ...over,
})

describe('railStationStatus', () => {
  it('keeps the next three future departures with platform/track/carrier and the age of the snapshot', () => {
    const snapshot = {
      stationId: '33605',
      departures: [row(-5), row(1), row(2, { status: 'onTime', delayMinutes: 0 }), row(3), row(4)],
      fetchedAt: new Date(NOW - 10_000).toISOString(),
    } as unknown as BoardSnapshot
    const status = railStationStatus(snapshot, NOW)
    expect(status.id).toBe('33605')
    expect(status.status).toBe('delayed')
    expect(status.ageMs).toBe(10_000)
    expect(status.nextDepartures).toHaveLength(3)
    expect(status.nextDepartures[0]).toEqual({
      plannedAt: row(1).plannedAt, headsign: 'Kutno', delayMinutes: 4, status: 'delayed',
      trainLabel: 'IC 1234', carrier: 'IC', platform: '3', track: '8',
    })
  })

  it('is unknown, not on time, when nothing departs any more', () => {
    const snapshot = { stationId: '1', departures: [row(-1)], fetchedAt: new Date(NOW).toISOString() } as unknown as BoardSnapshot
    expect(railStationStatus(snapshot, NOW)).toMatchObject({ status: 'unknown', nextDepartures: [] })
  })
})
