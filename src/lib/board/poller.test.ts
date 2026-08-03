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
    getCachedStationIds: vi.fn(() => null),
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

  it('keeps the normal interval when the API sends no rate-limit headers', async () => {
    // Regresja: brak nagłówka dawał wcześniej daily=0, co natychmiast i na
    // stałe spychało poller na interwał awaryjny 5 minut.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: null, daily: null } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('extends the interval when the hourly budget runs low even if the daily one is healthy', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 4, daily: 900 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(90000)
    expect(getOperations).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(210000)
    expect(getOperations).toHaveBeenCalledTimes(2)
  })

  it('waits with jitter before retrying a 5xx instead of firing again immediately', async () => {
    const getOperations = vi
      .fn()
      .mockRejectedValueOnce(new PkpApiError('boom', 500))
      .mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const sleep = vi.fn().mockResolvedValue(undefined)
    const client = makeClient({ getOperations })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000 },
      stationNames: new Map(),
      sleep,
      random: () => 0.5,
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(1000) // 500 bazy + 0.5 * 1000 jittera
    expect(getOperations).toHaveBeenCalledTimes(2)
    expect(poller.getStatus()).toBe('ok')
  })

  it('does not retry a 4xx that is not worth repeating', async () => {
    const getOperations = vi.fn().mockRejectedValue(new PkpApiError('bad request', 400))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const client = makeClient({ getOperations })
    const poller = createPoller({
      client,
      config: { pollIntervalMs: 90000, interestTtlMs: 300000 },
      stationNames: new Map(),
      sleep,
    })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)

    expect(getOperations).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
    expect(poller.getStatus()).toBe('degraded')
  })

  it('caps how many upstream calls a stream of unknown stations can force', async () => {
    // Kazde nowe ID omijalo dlawik 45 s, wiec seria zadan o kolejne stacje
    // zamieniala sie 1:1 na zapytania do PKP. Limit 100/h dalo sie w ten sposob
    // wyczerpac w 100 zadaniach i zdegradowac aplikacje dla wszystkich.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    for (let i = 0; i < 60; i += 1) {
      poller.registerInterest([`station-${i}`])
      await vi.advanceTimersByTimeAsync(10)
    }

    // Bez limitu byloby ok. 60 wywolan; z limitem znaczaco mniej.
    expect(getOperations.mock.calls.length).toBeLessThanOrEqual(12)
  })

  it('still fetches immediately for the first few new stations', async () => {
    // Limit nie moze psuc normalnego uzycia: dodanie kilku ulubionych stacji
    // ma nadal dawac dane od razu, bez czekania na kolejny przebieg.
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(1)

    poller.registerInterest(['5100', '5136'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(2)

    poller.registerInterest(['5100', '5136', '4900'])
    await vi.advanceTimersByTimeAsync(10)
    expect(getOperations).toHaveBeenCalledTimes(3)
  })

  it('lets the forced-run budget recover after the window passes', async () => {
    const getOperations = vi.fn().mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    for (let i = 0; i < 40; i += 1) {
      poller.registerInterest([`a-${i}`])
      await vi.advanceTimersByTimeAsync(10)
    }
    const afterBurst = getOperations.mock.calls.length

    // Po przejsciu okna pula wymuszen odbudowuje sie.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    const afterIdle = getOperations.mock.calls.length

    poller.registerInterest(['zupelnie-nowa'])
    await vi.advanceTimersByTimeAsync(10)

    expect(getOperations.mock.calls.length).toBeGreaterThan(afterIdle)
    expect(afterBurst).toBeLessThanOrEqual(12)
  })

  it('reports throttling only once it actually slowed down', async () => {
    const getOperations = vi
      .fn()
      .mockResolvedValueOnce({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 999 } })
      .mockResolvedValue({ trains: [], stationNames: {}, budget: { hourly: 99, daily: 10 } })
    const client = makeClient({ getOperations })
    const poller = createPoller({ client, config: { pollIntervalMs: 90000, interestTtlMs: 300000 }, stationNames: new Map() })

    poller.registerInterest(['5100'])
    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isThrottled()).toBe(false)

    await vi.advanceTimersByTimeAsync(90000)
    expect(poller.isThrottled()).toBe(true)
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
    // Ponowienie po 5xx czeka teraz na odstęp z jitterem (500-1500 ms), więc
    // przebieg domyka się dopiero po dodatkowym przesunięciu zegara.
    await vi.advanceTimersByTimeAsync(2000)

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
      .mockResolvedValue([
        { scheduleId: '26', orderId: '12345', carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC', name: null, nationalNumber: null, stations: [] },
      ])
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
