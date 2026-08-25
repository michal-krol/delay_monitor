import { describe, expect, it } from 'vitest'
import {
  carriersResponseSchema,
  commercialCategoriesResponseSchema,
  operationsResponseSchema,
  schedulesResponseSchema,
  stationSearchResponseSchema,
} from './schema'

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

  it('rejects an explicit null id instead of coercing it to the string "null"', () => {
    expect(() => stationSearchResponseSchema.parse({ stations: [{ id: null, name: 'X' }] })).toThrow()
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
      isConfirmed: false,
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

  it('rejects an explicit null scheduleId or stationId instead of coercing to the string "null"', () => {
    expect(() =>
      operationsResponseSchema.parse({
        trains: [{ scheduleId: null, orderId: 1, stations: [] }],
      })
    ).toThrow()
    expect(() =>
      operationsResponseSchema.parse({
        trains: [{ scheduleId: 25, orderId: 1, stations: [{ stationId: null, plannedDeparture: '2026-08-01T12:15:00+02:00' }] }],
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

  it('flattens dictionaries.stations (id -> {id, name}) into stationNames (id -> name)', () => {
    const result = schedulesResponseSchema.parse({
      routes: [],
      dictionaries: { stations: { '109': { id: 109, name: 'Szczecin Port Centralny' } } },
    })
    expect(result.stationNames).toEqual({ '109': 'Szczecin Port Centralny' })
  })

  it('defaults stationNames to an empty object when dictionaries is missing', () => {
    const result = schedulesResponseSchema.parse({ routes: [] })
    expect(result.stationNames).toEqual({})
  })
})

describe('carriersResponseSchema', () => {
  it('builds a code -> name map from the carriers list', () => {
    const result = carriersResponseSchema.parse({
      carriers: [
        { code: 'IC', name: '„PKP Intercity” Spółka Akcyjna', validFrom: '1999-01-01T00:00:00', validTo: '2999-12-31T00:00:00' },
        { code: 'KM', name: '"Koleje Mazowieckie - KM" sp. z o.o.' },
      ],
    })
    expect(result.carrierNames).toEqual({
      IC: '„PKP Intercity” Spółka Akcyjna',
      KM: '"Koleje Mazowieckie - KM" sp. z o.o.',
    })
  })

  it('skips entries with a null code or null name instead of poisoning the map with "null" keys', () => {
    const result = carriersResponseSchema.parse({
      carriers: [
        { code: null, name: 'Bez kodu' },
        { code: 'X', name: null },
        { code: 'IC', name: 'PKP Intercity' },
      ],
    })
    expect(result.carrierNames).toEqual({ IC: 'PKP Intercity' })
  })

  it('normalizes a null carriers list to an empty map', () => {
    const result = carriersResponseSchema.parse({ carriers: null })
    expect(result.carrierNames).toEqual({})
  })
})

describe('commercialCategoriesResponseSchema', () => {
  it('keys the name map by carrierCode|code, because the same code means different things per carrier', () => {
    const result = commercialCategoriesResponseSchema.parse({
      commercialCategories: [
        { code: 'Ex', name: 'Express', carrierCode: 'IC', speedCategoryCode: 'SZ' },
        { code: 'Ex', name: 'LEO Express', carrierCode: 'LEO', speedCategoryCode: 'DA' },
      ],
    })
    expect(result.categoryNames).toEqual({
      'IC|Ex': 'Express',
      'LEO|Ex': 'LEO Express',
    })
  })

  it('skips entries with a null code or null name', () => {
    const result = commercialCategoriesResponseSchema.parse({
      commercialCategories: [
        { code: null, name: 'Bez kodu', carrierCode: 'IC' },
        { code: 'EIC', name: null, carrierCode: 'IC' },
        { code: 'EIC', name: 'Express InterCity', carrierCode: 'IC' },
      ],
    })
    expect(result.categoryNames).toEqual({ 'IC|EIC': 'Express InterCity' })
  })

  it('normalizes a null commercialCategories list to an empty map', () => {
    const result = commercialCategoriesResponseSchema.parse({ commercialCategories: null })
    expect(result.categoryNames).toEqual({})
  })
})
