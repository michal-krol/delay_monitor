import { describe, expect, it } from 'vitest'
import { transformOperations } from './transform'
import type { RawOperation } from '../pkp/types'

function op(overrides: Partial<RawOperation> & { stop: Partial<RawOperation['stop']> }): RawOperation {
  return {
    stationId: '5100',
    trainNumber: '1',
    carrier: 'PKP Intercity',
    category: 'EIC',
    originStationName: 'A',
    destinationStationName: 'B',
    ...overrides,
    stop: {
      plannedArrival: null,
      actualArrival: null,
      plannedDeparture: null,
      actualDeparture: null,
      delayMinutes: null,
      cancelled: false,
      platform: null,
      ...overrides.stop,
    },
  }
}

const NOW = new Date('2026-08-01T12:00:00+02:00')

describe('transformOperations', () => {
  it('marks a cancelled train as cancelled even without actual times', () => {
    const snapshot = transformOperations(
      '5100',
      'Warszawa Centralna',
      [op({ stop: { plannedDeparture: '2026-08-01T12:10:00+02:00', cancelled: true } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures[0].status).toBe('cancelled')
  })

  it('marks a train with no real-time data as unknown', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [op({ stop: { plannedDeparture: '2026-08-01T12:10:00+02:00', actualDeparture: null } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures[0].status).toBe('unknown')
  })

  it('computes delay across midnight using full dates, not time-of-day', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [
        op({
          stop: {
            plannedDeparture: '2026-08-01T23:58:00+02:00',
            actualDeparture: '2026-08-02T00:04:00+02:00',
            delayMinutes: null,
          },
        }),
      ],
      '2026-08-01T23:59:00+02:00',
      new Date('2026-08-01T23:59:00+02:00')
    )
    expect(snapshot.departures[0].delayMinutes).toBe(6)
    expect(snapshot.departures[0].status).toBe('delayed')
  })

  it('puts a terminus arrival (no departure) only in arrivals', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [op({ stop: { plannedArrival: '2026-08-01T12:10:00+02:00' } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.departures).toHaveLength(0)
  })

  it('puts an origin departure (no arrival) only in departures', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [op({ stop: { plannedDeparture: '2026-08-01T12:10:00+02:00' } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.arrivals).toHaveLength(0)
  })

  it('passes through a null platform', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [op({ stop: { plannedDeparture: '2026-08-01T12:10:00+02:00', platform: null } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures[0].platform).toBeNull()
  })

  it('trusts the API delay value over the computed fallback', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [
        op({
          stop: {
            plannedDeparture: '2026-08-01T12:10:00+02:00',
            actualDeparture: '2026-08-01T12:20:00+02:00',
            delayMinutes: 3,
          },
        }),
      ],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures[0].delayMinutes).toBe(3)
  })

  it('sorts ascending by plannedAt and caps at 20 rows within a 2h window', () => {
    const operations = Array.from({ length: 25 }, (_, i) =>
      op({
        trainNumber: String(i),
        stop: {
          plannedDeparture: new Date(NOW.getTime() + (25 - i) * 60000).toISOString(),
        },
      })
    )
    const snapshot = transformOperations('5100', 'X', operations, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(20)
    expect(snapshot.departures[0].trainNumber).toBe('24')
    expect(new Date(snapshot.departures[0].plannedAt).getTime()).toBeLessThan(
      new Date(snapshot.departures[1].plannedAt).getTime()
    )
  })

  it('excludes departures more than 2 hours in the future', () => {
    const snapshot = transformOperations(
      '5100',
      'X',
      [op({ stop: { plannedDeparture: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString() } })],
      NOW.toISOString(),
      NOW
    )
    expect(snapshot.departures).toHaveLength(0)
  })
})
