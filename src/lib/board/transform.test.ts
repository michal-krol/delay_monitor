import { describe, expect, it } from 'vitest'
import { transformOperations } from './transform'
import type { RawOperationStation, RawTrainOperation } from '../pkp/types'

function stop(overrides: Partial<RawOperationStation> & { stationId: string }): RawOperationStation {
  return {
    plannedArrival: null,
    actualArrival: null,
    plannedDeparture: null,
    actualDeparture: null,
    arrivalDelayMinutes: null,
    departureDelayMinutes: null,
    isCancelled: false,
    ...overrides,
  }
}

function train(scheduleId: string, orderId: string, stations: RawOperationStation[]): RawTrainOperation {
  return { scheduleId, orderId, stations }
}

const NAMES = { '5100': 'Warszawa Centralna', '5136': 'Kraków Główny', '4900': 'Wrocław Główny' }
const NOW = new Date('2026-08-01T12:00:00+02:00')

describe('transformOperations', () => {
  it('marks a cancelled train as cancelled even without actual times', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00', isCancelled: true })]),
    ]
    const snapshot = transformOperations('5100', 'Warszawa Centralna', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('cancelled')
  })

  it('marks a train with no real-time data as unknown', () => {
    const trains = [train('25', '1', [stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' })])]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].status).toBe('unknown')
  })

  it('computes delay across midnight using full dates, not time-of-day', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T23:58:00+02:00',
          actualDeparture: '2026-08-02T00:04:00+02:00',
        }),
      ]),
    ]
    const at = new Date('2026-08-01T23:59:00+02:00')
    const snapshot = transformOperations('5100', 'X', trains, NAMES, at.toISOString(), at)
    expect(snapshot.departures[0].delayMinutes).toBe(6)
    expect(snapshot.departures[0].status).toBe('delayed')
  })

  it('puts a terminus arrival (last stop on the route) only in arrivals, headsign = origin', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5136', plannedDeparture: '2026-08-01T11:00:00+02:00' }),
        stop({ stationId: '5100', plannedArrival: '2026-08-01T12:10:00+02:00' }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.arrivals[0].headsign).toBe('Kraków Główny')
    expect(snapshot.departures).toHaveLength(0)
  })

  it('puts an origin departure (first stop on the route) only in departures, headsign = destination', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:10:00+02:00' }),
        stop({ stationId: '4900', plannedArrival: '2026-08-01T14:00:00+02:00' }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.departures[0].headsign).toBe('Wrocław Główny')
    expect(snapshot.arrivals).toHaveLength(0)
  })

  it('shows an intermediate stop in both departures and arrivals', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5136', plannedDeparture: '2026-08-01T10:00:00+02:00' }),
        stop({
          stationId: '5100',
          plannedArrival: '2026-08-01T12:05:00+02:00',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
        }),
        stop({ stationId: '4900', plannedArrival: '2026-08-01T14:00:00+02:00' }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(1)
    expect(snapshot.departures[0].headsign).toBe('Wrocław Główny')
    expect(snapshot.arrivals).toHaveLength(1)
    expect(snapshot.arrivals[0].headsign).toBe('Kraków Główny')
  })

  it('falls back to the raw station id when the name dictionary is missing an entry', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5100', plannedDeparture: '2026-08-01T12:00:00+02:00' }),
        stop({ stationId: '9999', plannedArrival: '2026-08-01T13:00:00+02:00' }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, {}, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].headsign).toBe('9999')
  })

  it('trusts the API delay value over the computed fallback', () => {
    const trains = [
      train('25', '1', [
        stop({
          stationId: '5100',
          plannedDeparture: '2026-08-01T12:10:00+02:00',
          actualDeparture: '2026-08-01T12:20:00+02:00',
          departureDelayMinutes: 3,
        }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures[0].delayMinutes).toBe(3)
  })

  it('sorts ascending by plannedAt and caps at 20 rows within a 2h window', () => {
    const trains = Array.from({ length: 25 }, (_, i) =>
      train(String(i), '1', [
        stop({
          stationId: '5100',
          plannedDeparture: new Date(NOW.getTime() + (25 - i) * 60000).toISOString(),
        }),
      ])
    )
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(20)
    expect(snapshot.departures[0].trainNumber).toBe('24-1')
    expect(new Date(snapshot.departures[0].plannedAt).getTime()).toBeLessThan(
      new Date(snapshot.departures[1].plannedAt).getTime()
    )
  })

  it('excludes departures more than 2 hours in the future', () => {
    const trains = [
      train('25', '1', [
        stop({ stationId: '5100', plannedDeparture: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString() }),
      ]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(0)
  })

  it('ignores trains that never stop at the requested station', () => {
    const trains = [
      train('25', '1', [stop({ stationId: '5136', plannedDeparture: '2026-08-01T12:10:00+02:00' })]),
    ]
    const snapshot = transformOperations('5100', 'X', trains, NAMES, NOW.toISOString(), NOW)
    expect(snapshot.departures).toHaveLength(0)
    expect(snapshot.arrivals).toHaveLength(0)
  })
})
