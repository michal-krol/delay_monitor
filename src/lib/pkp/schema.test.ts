import { describe, expect, it } from 'vitest'
import { operationsResponseSchema, schedulesResponseSchema, stationSearchResponseSchema } from './schema'

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

  it('interprets a timezone-less departure time as Warsaw local time, not UTC', () => {
    // Zaobserwowane na produkcji: /operations potrafi zwrócić czas bez
    // oznaczenia strefy. Bez normalizacji new Date() bierze ten ciąg za UTC
    // na kontenerze, którego strefa procesu to UTC — pociąg, który już
    // odjechał wg zegara warszawskiego, wygląda jak nadchodzący za chwilę.
    const result = operationsResponseSchema.parse({
      trains: [
        {
          scheduleId: 25,
          orderId: 118845,
          stations: [{ stationId: 5100, plannedDeparture: '2026-08-02T00:33:00' }],
        },
      ],
    })
    expect(result.trains[0].stations[0].plannedDeparture).toBe('2026-08-01T22:33:00.000Z')
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

describe('schedulesResponseSchema', () => {
  it('parses a route and coerces numeric ids to strings', () => {
    const result = schedulesResponseSchema.parse({
      routes: [{ scheduleId: 25, orderId: 118845, carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC' }],
    })
    expect(result.routes[0]).toEqual({
      scheduleId: '25',
      orderId: '118845',
      trainOrderId: null,
      carrierCode: 'PKP_IC',
      commercialCategorySymbol: 'EIC',
      name: null,
      nationalNumber: null,
      stations: [],
    })
  })

  it('defaults missing carrier/category fields to null', () => {
    const result = schedulesResponseSchema.parse({ routes: [{ scheduleId: 25, orderId: 1 }] })
    expect(result.routes[0].carrierCode).toBeNull()
    expect(result.routes[0].commercialCategorySymbol).toBeNull()
  })

  it('normalizes a null routes list to an empty array', () => {
    const result = schedulesResponseSchema.parse({ routes: null })
    expect(result.routes).toEqual([])
  })
})
