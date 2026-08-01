import { describe, expect, it } from 'vitest'
import { operationsResponseSchema, stationSearchResponseSchema } from './schema'

describe('stationSearchResponseSchema', () => {
  it('parses known fields and ignores unknown ones', () => {
    const result = stationSearchResponseSchema.parse({
      stations: [{ id: '5100', name: 'Warszawa Centralna', futureField: 'xyz' }],
    })
    expect(result.stations).toEqual([{ id: '5100', name: 'Warszawa Centralna', futureField: 'xyz' }])
  })

  it('coerces a numeric station id to a string (the real API returns integers)', () => {
    const result = stationSearchResponseSchema.parse({ stations: [{ id: 5100, name: 'Warszawa Centralna' }] })
    expect(result.stations[0].id).toBe('5100')
  })

  it('rejects a station missing a required field', () => {
    expect(() => stationSearchResponseSchema.parse({ stations: [{ id: '5100' }] })).toThrow()
  })
})

describe('operationsResponseSchema', () => {
  it('parses a train with a station stop and defaults missing optional fields', () => {
    const result = operationsResponseSchema.parse({
      trains: [
        {
          scheduleId: 25,
          orderId: 118845,
          stations: [{ stationId: 5100, plannedDeparture: '2026-08-01T12:15:00+02:00' }],
        },
      ],
      stations: { '5100': 'Warszawa Centralna' },
    })
    expect(result.trains[0].scheduleId).toBe('25')
    expect(result.trains[0].orderId).toBe('118845')
    expect(result.trains[0].stations[0]).toEqual({
      stationId: '5100',
      plannedArrival: null,
      plannedDeparture: '2026-08-01T12:15:00+02:00',
      actualArrival: null,
      actualDeparture: null,
      arrivalDelayMinutes: null,
      departureDelayMinutes: null,
      isCancelled: false,
    })
  })

  it('normalizes a null trains list to an empty array (the real API documents it as nullable)', () => {
    const result = operationsResponseSchema.parse({ trains: null, stations: null })
    expect(result.trains).toEqual([])
    expect(result.stations).toEqual({})
  })

  it('normalizes a null per-train stations list to an empty array', () => {
    const result = operationsResponseSchema.parse({
      trains: [{ scheduleId: 25, orderId: 1, stations: null }],
    })
    expect(result.trains[0].stations).toEqual([])
  })

  it('rejects a train missing scheduleId', () => {
    expect(() =>
      operationsResponseSchema.parse({
        trains: [{ orderId: 1, stations: [] }],
      })
    ).toThrow()
  })
})
