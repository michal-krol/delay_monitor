import { describe, expect, it } from 'vitest'
import {
  carriersResponseSchema,
  commercialCategoriesResponseSchema,
  dailyRoutesResponseSchema,
  disruptionsCountResponseSchema,
  disruptionsResponseSchema,
  operationsResponseSchema,
  operationsStatisticsResponseSchema,
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
      operatingDates: [],
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

describe('operationsStatisticsResponseSchema', () => {
  it('parses the nationwide status counters', () => {
    const result = operationsStatisticsResponseSchema.parse({
      generatedAt: '2026-08-26T19:53:29Z',
      totalTrains: 7256,
      notStarted: 1690,
      inProgress: 723,
      completed: 4803,
      cancelled: 15,
      partialCancelled: 25,
    })
    expect(result.totalTrains).toBe(7256)
    expect(result.partialCancelled).toBe(25)
  })
})

describe('dailyRoutesResponseSchema', () => {
  it('reads carrierCode from each route (other fields pass through unvalidated)', () => {
    const result = dailyRoutesResponseSchema.parse({
      routes: [{ scheduleId: '2026', orderId: '1', carrierCode: 'IC', name: 'WITKACY' }, { carrierCode: null }],
    })
    expect(result.routes.map((route) => route.carrierCode)).toEqual(['IC', null])
  })

  it('normalizes a null routes list to an empty array', () => {
    const result = dailyRoutesResponseSchema.parse({ routes: null })
    expect(result.routes).toEqual([])
  })
})

describe('disruptionsCountResponseSchema', () => {
  it('reduces the response to just the count', () => {
    expect(disruptionsCountResponseSchema.parse({ disruptions: [{}, {}, {}] })).toBe(3)
  })

  it('treats a missing disruptions list as zero, not an error', () => {
    expect(disruptionsCountResponseSchema.parse({ disruptions: null })).toBe(0)
  })
})

describe('disruptionsResponseSchema', () => {
  it('parses a disruption with affectedRoutes, coercing numeric ids to strings', () => {
    const result = disruptionsResponseSchema.parse({
      disruptions: [
        {
          disruptionId: 1,
          message: 'utr_40',
          affectedRoutes: [{ scheduleId: 2026, orderId: 12345, operatingDate: '2026-08-26', stationId: 7500, sequenceNumber: 1 }],
        },
      ],
      disruptionTypes: { utr_40: 'Awaria sieci trakcyjnej' },
    })
    expect(result.disruptions).toEqual([
      {
        disruptionId: 1,
        message: 'utr_40',
        affectedRoutes: [{ scheduleId: '2026', orderId: '12345', operatingDate: '2026-08-26', stationId: '7500', sequenceNumber: 1 }],
      },
    ])
    expect(result.disruptionTypes).toEqual({ utr_40: 'Awaria sieci trakcyjnej' })
  })

  it('defaults disruptions to an empty array when null or missing', () => {
    expect(disruptionsResponseSchema.parse({ disruptions: null }).disruptions).toEqual([])
    expect(disruptionsResponseSchema.parse({}).disruptions).toEqual([])
  })

  it('defaults disruptionTypes to an empty object when null or missing', () => {
    expect(disruptionsResponseSchema.parse({ disruptionTypes: null }).disruptionTypes).toEqual({})
    expect(disruptionsResponseSchema.parse({}).disruptionTypes).toEqual({})
  })

  it('defaults a disruption missing affectedRoutes to an empty array', () => {
    const result = disruptionsResponseSchema.parse({ disruptions: [{ disruptionId: 1, message: null }] })
    expect(result.disruptions[0].affectedRoutes).toEqual([])
  })

  it('keeps message as null instead of coercing it to a string', () => {
    const result = disruptionsResponseSchema.parse({ disruptions: [{ disruptionId: 1, message: null, affectedRoutes: [] }] })
    expect(result.disruptions[0].message).toBeNull()
  })

  it('ignores undocumented fields like disruptionTypeCode without failing to parse', () => {
    const result = disruptionsResponseSchema.parse({
      disruptions: [{ disruptionId: 1, message: null, disruptionTypeCode: null, startStationId: null, endStationId: null, affectedRoutes: [] }],
    })
    expect(result.disruptions[0].disruptionId).toBe(1)
  })
})


describe('schedulesResponseSchema — pola przystanku trasy', () => {
  it('reads stopTypeName from a route stop', () => {
    const result = schedulesResponseSchema.parse({
      routes: [{ scheduleId: 2026, orderId: 1, stations: [{ stationId: 33605, stopTypeName: 'tylko dla wysiadających' }] }],
    })
    expect(result.routes[0].stations[0].stopTypeName).toBe('tylko dla wysiadających')
  })

  // Na żywym API pole jest wypełnione w 353 z 8380 przystanków — brak jest
  // regułą, nie wyjątkiem, więc nie może niczego wywracać.
  it('defaults a missing stopTypeName to null', () => {
    const result = schedulesResponseSchema.parse({
      routes: [{ scheduleId: 2026, orderId: 1, stations: [{ stationId: 33605 }] }],
    })
    expect(result.routes[0].stations[0].stopTypeName).toBeNull()
  })
})
