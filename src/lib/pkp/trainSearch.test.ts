import { describe, expect, it, vi } from 'vitest'
import { createTrainSearchIndex } from './trainSearch'
import { createNationalSchedules } from './nationalSchedules'
import { rawRouteSchema } from './schema'

const route = (overrides: Record<string, unknown> = {}) => rawRouteSchema.parse({
  scheduleId: '10', orderId: '20', nationalNumber: '123', name: 'Łódzki',
  operatingDates: ['2026-10-21', '2026-10-22'],
  stations: [{ stationId: '1' }, { stationId: '2' }], ...overrides,
})

describe('cached train search', () => {
  it('does not present partial fallback endpoints as the complete train relation', async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce({ json: { routes: [route({ stations: [] })] } })
      .mockResolvedValueOnce({ json: { routes: [route()], dictionaries: { stations: {
        '1': { id: '1', name: 'Partial first' }, '2': { id: '2', name: 'Partial last' },
      } } } })
    const store = createNationalSchedules(fetchJson, () => new Date('2026-10-21T10:00:00Z'))
    await store.getSchedules(['1'])
    expect(store.searchCachedTrains('123').trains[0]).toMatchObject({ origin: null, destination: null })
  })
  it('ranks exact number before prefix and name, retaining each operating day and variant', () => {
    const index = createTrainSearchIndex([
      route({ orderId: '21', nationalNumber: '1234' }),
      route({ orderId: '22', nationalNumber: '999', name: '123 Express' }),
      route(), route(),
    ], { '1': 'Łódź Fabryczna', '2': 'Warszawa Centralna' })
    const hits = index.search('123', '2026-10-21', '2026-10-22')
    expect(hits.map((hit) => [hit.orderId, hit.operatingDate])).toEqual([
      ['20', '2026-10-21'], ['20', '2026-10-22'],
      ['21', '2026-10-21'], ['21', '2026-10-22'],
      ['22', '2026-10-21'], ['22', '2026-10-22'],
    ])
    expect(hits[0]).toMatchObject({ origin: 'Łódź Fabryczna', destination: 'Warszawa Centralna' })
  })

  it('normalizes names, filters dates and never invents a relation or operating day', () => {
    const index = createTrainSearchIndex([
      route({ stations: [], operatingDates: ['2026-10-20', '2026-10-21', 'invalid'] }),
      route({ orderId: '21', operatingDates: [] }),
    ], {})
    expect(index.search(' lodz ', '2026-10-21', '2026-10-22')).toEqual([
      { scheduleId: '10', orderId: '20', operatingDate: '2026-10-21', name: 'Łódzki', nationalNumber: '123', origin: null, destination: null },
    ])
    expect(index.search('12', '2026-10-21', '2026-10-22')).toEqual([])
  })

  it('limits results and rejects unsafe identifiers before publishing a link', () => {
    const index = createTrainSearchIndex([
      route({ scheduleId: '../bad' }),
      ...Array.from({ length: 20 }, (_, n) => route({ orderId: String(n) })),
    ], {})
    const hits = index.search('123', '2026-10-21', '2026-10-22')
    expect(hits).toHaveLength(8)
    expect(hits.every((hit) => hit.scheduleId === '10')).toBe(true)
  })

  it('reads only the existing snapshot, including cold start and Warsaw midnight', async () => {
    let instant = new Date('2026-10-21T21:59:00Z')
    const fetchJson = vi.fn().mockResolvedValue({ json: { routes: [route()], stations: {}, carriers: {}, commercialCategories: {} } })
    const store = createNationalSchedules(fetchJson, () => instant)
    expect(store.searchCachedTrains('123')).toEqual({ trains: [], state: 'unavailable' })
    expect(fetchJson).not.toHaveBeenCalled()
    await store.getSchedules(['1'])
    expect(store.searchCachedTrains('123').trains.map((hit) => hit.operatingDate)).toEqual(['2026-10-21', '2026-10-22'])
    expect(store.searchCachedTrains('123').state).toBe('ready')
    expect(fetchJson).toHaveBeenCalledTimes(1)
    instant = new Date('2026-10-21T22:01:00Z')
    expect(store.searchCachedTrains('123')).toEqual({ trains: [], state: 'unavailable' })
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })
})
