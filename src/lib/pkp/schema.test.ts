import { describe, expect, it } from 'vitest'
import { operationsResponseSchema, stationSearchResponseSchema } from './schema'

describe('stationSearchResponseSchema', () => {
  it('parses known fields and ignores unknown ones', () => {
    const result = stationSearchResponseSchema.parse({
      stations: [{ id: '5100', name: 'Warszawa Centralna', futureField: 'xyz' }],
    })
    expect(result.stations).toEqual([{ id: '5100', name: 'Warszawa Centralna', futureField: 'xyz' }])
  })

  it('rejects a station missing a required field', () => {
    expect(() => stationSearchResponseSchema.parse({ stations: [{ id: '5100' }] })).toThrow()
  })
})

describe('operationsResponseSchema', () => {
  it('parses a full operation and defaults missing optional stop fields', () => {
    const result = operationsResponseSchema.parse({
      operations: [
        {
          stationId: '5100',
          trainNumber: '12345',
          carrier: 'PKP Intercity',
          category: 'EIC',
          originStationName: 'Warszawa Centralna',
          destinationStationName: 'Kraków Główny',
          stop: { plannedDeparture: '2026-08-01T12:15:00+02:00' },
          unknownTopLevelField: 'should pass through',
        },
      ],
    })
    expect(result.operations[0].stop).toEqual({
      plannedArrival: null,
      actualArrival: null,
      plannedDeparture: '2026-08-01T12:15:00+02:00',
      actualDeparture: null,
      delayMinutes: null,
      cancelled: false,
      platform: null,
    })
  })

  it('rejects an operation missing trainNumber', () => {
    expect(() =>
      operationsResponseSchema.parse({
        operations: [{ stationId: '5100', stop: {} }],
      })
    ).toThrow()
  })
})
