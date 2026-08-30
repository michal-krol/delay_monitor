import { describe, expect, it } from 'vitest'
import { findRouteForTrain, indexRoutesByTrain, routeKey } from './routeKey'
import type { RawRoute, RawTrainOperation } from '../pkp/types'

const TODAY = '2026-08-28'
const TOMORROW = '2026-08-29'

function route(overrides: Partial<RawRoute> & { orderId: string }): RawRoute {
  return {
    scheduleId: '2026',
    trainOrderId: null,
    carrierCode: null,
    commercialCategorySymbol: null,
    name: null,
    nationalNumber: null,
    operatingDates: [TODAY],
    stations: [],
    ...overrides,
  }
}

function train(overrides: Partial<RawTrainOperation> = {}): RawTrainOperation {
  return {
    scheduleId: '2026',
    orderId: '1',
    trainOrderId: null,
    operatingDate: TODAY,
    trainStatus: null,
    stations: [],
    ...overrides,
  }
}

describe('indexRoutesByTrain + findRouteForTrain', () => {
  it('keeps both day-variants of the same run instead of letting one overwrite the other', () => {
    // Kształt zmierzony na żywym API (Warszawa Zachodnia, 2026-08-28): ten sam
    // `trainOrderId`, różne `orderId`, po jednym dniu kursowania każdy.
    // 351 z 2008 tras kolidowało tak na jednej stacji, a w 217 przypadkach
    // zwykła mapa „ostatni wygrywa" zostawiała rekord z NIEWŁAŚCIWEGO dnia.
    const todayRoute = route({ orderId: '339763523', trainOrderId: '516116489', operatingDates: [TODAY], name: 'DZIS' })
    const tomorrowRoute = route({ orderId: '310138471', trainOrderId: '516116489', operatingDates: [TOMORROW], name: 'JUTRO' })

    const index = indexRoutesByTrain([todayRoute, tomorrowRoute])

    expect(findRouteForTrain(index, train({ orderId: '339763523', trainOrderId: '516116489', operatingDate: TODAY }))?.name).toBe('DZIS')
    expect(findRouteForTrain(index, train({ orderId: '310138471', trainOrderId: '516116489', operatingDate: TOMORROW }))?.name).toBe('JUTRO')
  })

  it('picks today even when tomorrow\'s record was indexed last', () => {
    // Kolejność wejścia nie może decydować o wyniku -- to była właśnie
    // przyczyna błędu, gdy indeksem była zwykła `new Map(routes.map(...))`.
    const index = indexRoutesByTrain([
      route({ orderId: 'a', trainOrderId: 'shared', operatingDates: [TODAY], name: 'DZIS' }),
      route({ orderId: 'b', trainOrderId: 'shared', operatingDates: [TOMORROW], name: 'JUTRO' }),
    ])

    expect(findRouteForTrain(index, train({ orderId: 'a', trainOrderId: 'shared', operatingDate: TODAY }))?.name).toBe('DZIS')
  })

  it('falls back to the run key when the route carries no operating dates', () => {
    const index = indexRoutesByTrain([route({ orderId: '1', operatingDates: [], name: 'BEZ DAT' })])

    expect(findRouteForTrain(index, train({ orderId: '1', operatingDate: TODAY }))?.name).toBe('BEZ DAT')
  })

  it('falls back to the run key when the train itself has no operating date', () => {
    const index = indexRoutesByTrain([route({ orderId: '1', name: 'TRASA' })])

    expect(findRouteForTrain(index, train({ orderId: '1', operatingDate: null }))?.name).toBe('TRASA')
  })

  it('matches a route running on several days on each of them', () => {
    const index = indexRoutesByTrain([route({ orderId: '1', operatingDates: [TODAY, TOMORROW], name: 'CODZIENNY' })])

    expect(findRouteForTrain(index, train({ orderId: '1', operatingDate: TODAY }))?.name).toBe('CODZIENNY')
    expect(findRouteForTrain(index, train({ orderId: '1', operatingDate: TOMORROW }))?.name).toBe('CODZIENNY')
  })

  it('survives a route whose operatingDates field is missing entirely', () => {
    // Gdyby API przestało zwracać to pole, `for...of undefined` rzuciłoby
    // wewnątrz `try` w pollerze i zdegradowało CAŁY rozkład do pustego.
    const broken = { ...route({ orderId: '1', name: 'USZKODZONA' }), operatingDates: undefined } as unknown as RawRoute

    expect(() => indexRoutesByTrain([broken])).not.toThrow()
    expect(findRouteForTrain(indexRoutesByTrain([broken]), train({ orderId: '1' }))?.name).toBe('USZKODZONA')
  })

  it('returns undefined for a train with no matching route at all', () => {
    expect(findRouteForTrain(indexRoutesByTrain([]), train())).toBeUndefined()
  })

  it('prefers trainOrderId over orderId, as the join key always did', () => {
    expect(routeKey('2026', '366302732', '12345')).toBe('2026-12345')
    expect(routeKey('2026', '12345', null)).toBe('2026-12345')
  })
})
