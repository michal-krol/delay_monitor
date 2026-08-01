import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from './poller'
import { PkpApiError } from '../pkp/client'
import type { PkpClient } from '../pkp/client'
import type { RawTrainOperation } from '../pkp/types'

function makeTrain(scheduleId: string, orderId: string, stationId: string): RawTrainOperation {
  return {
    scheduleId,
    orderId,
    stations: [
      {
        stationId,
        plannedArrival: null,
        actualArrival: null,
        plannedDeparture: new Date(Date.now() + 5 * 60000).toISOString(),
        actualDeparture: null,
        arrivalDelayMinutes: null,
        departureDelayMinutes: null,
        isCancelled: false,
      },
    ],
  }
}

function makeClient(overrides: Partial<PkpClient> = {}): PkpClient {
  return {
    searchStations: vi.fn().mockResolvedValue([]),
    getOperations: vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } }),
    getSchedules: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-01T12:00:00+02:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createPoller', () => {
  it('wakes and fires immediately on the first registerInterest call', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(poller.isAwake()).toBe(true)
  })

  it('merges multiple stations into a single request', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100', '5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(getOperations).toHaveBeenCalledWith(['5100', '5136'])
  })

  it('sleeps after interestTtlMs of silence', async () => {
    const client = makeClient()
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isAwake()).toBe(true)

    await vi.advanceTimersByTimeAsync(300000)
    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.isAwake()).toBe(false)
  })

  it('does not fire when the active set is empty', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    await vi.advanceTimersByTimeAsync(200000)

    expect(getOperations).not.toHaveBeenCalled()
    expect(poller.isAwake()).toBe(false)
  })

  it('respects the 45s throttle when all requested stations already have data', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
  })

  it('bypasses the throttle immediately when a newly watched station has no data yet', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    poller.registerInterest(['5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100', '5136'])
  })

  it('forces a run once 45s have passed since the last run, even for a station that already has data', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(46000)
    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100'])
  })

  it('extends the interval to 5 minutes when daily budget drops below 50', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 5, daily: 40 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(210000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous snapshot when a request fails', async () => {
    const goodTrains = [makeTrain('25', '1', '5100')]
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ trains: goodTrains, stationNames: { '5100': 'Warszawa Centralna' }, budget: { hourly: 99, daily: 999 } })
      .mockRejectedValueOnce(new PkpApiError('boom', 500))
      .mockRejectedValueOnce(new PkpApiError('boom', 500))
    const client = makeClient({ getOperations })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000 },
      stationNames: new Map([['5100', 'Warszawa Centralna']]),
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    const goodSnapshot = poller.getSnapshot('5100')
    expect(goodSnapshot?.departures).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(90000)

    expect(poller.getSnapshot('5100')).toEqual(goodSnapshot)
    expect(poller.getStatus()).toBe('degraded')
  })

  it('stops polling on a 401 and reports configError', async () => {
    const getOperations = vi.fn().mockRejectedValue(new PkpApiError('unauthorized', 401))
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(poller.getStatus()).toBe('configError')
    expect(poller.isAwake()).toBe(false)
  })

  it('joins schedules onto operations by scheduleId-orderId to fill carrier and category', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [makeTrain('26', '12345', '5100')],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi
      .fn()
      .mockResolvedValue([{ scheduleId: '26', orderId: '12345', carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC' }])
    const client = makeClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row?.carrier).toBe('PKP_IC')
    expect(row?.category).toBe('EIC')
  })

  it('keeps operations data and status ok even when the schedules fetch fails', async () => {
    const getOperations = vi.fn().mockResolvedValue({
      trains: [makeTrain('26', '12345', '5100')],
      stationNames: { '5100': 'Warszawa Centralna' },
      budget: { hourly: 99, daily: 999 },
    })
    const getSchedules = vi.fn().mockRejectedValue(new PkpApiError('boom', 500))
    const client = makeClient({ getOperations, getSchedules })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    const row = poller.getSnapshot('5100')?.departures[0]
    expect(row).toBeDefined()
    expect(row?.carrier).toBe('')
    expect(poller.getStatus()).toBe('ok')
  })
})
