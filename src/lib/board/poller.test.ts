import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from './poller'
import { PkpApiError } from '../pkp/client'
import type { PkpClient } from '../pkp/client'
import type { RawOperation } from '../pkp/types'

function makeOperation(stationId: string, trainNumber: string): RawOperation {
  return {
    stationId,
    trainNumber,
    carrier: 'PKP Intercity',
    category: 'EIC',
    originStationName: 'A',
    destinationStationName: 'B',
    stop: {
      plannedArrival: null,
      actualArrival: null,
      plannedDeparture: new Date(Date.now() + 5 * 60000).toISOString(),
      actualDeparture: null,
      delayMinutes: null,
      cancelled: false,
      platform: null,
    },
  }
}

function makeClient(overrides: Partial<PkpClient> = {}): PkpClient {
  return {
    searchStations: vi.fn().mockResolvedValue([]),
    getOperations: vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } }),
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
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(poller.isAwake()).toBe(true)
  })

  it('merges multiple stations into a single request', async () => {
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } })
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
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    await vi.advanceTimersByTimeAsync(200000)

    expect(getOperations).not.toHaveBeenCalled()
    expect(poller.isAwake()).toBe(false)
  })

  it('respects the 45s throttle on forced runs', async () => {
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    poller.registerInterest(['5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
  })

  it('forces a run once 45s have passed since the last run', async () => {
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(46000)
    poller.registerInterest(['5136'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(getOperations).toHaveBeenLastCalledWith(['5100', '5136'])
  })

  it('extends the interval to 5 minutes when daily budget drops below 50', async () => {
    const getOperations = vi.fn().mockResolvedValue({ operations: [], budget: { hourly: 5, daily: 40 } })
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
    const goodOperations = [makeOperation('5100', '1')]
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ operations: goodOperations, budget: { hourly: 99, daily: 999 } })
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
})
