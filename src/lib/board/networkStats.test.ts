import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNetworkStats, resetNetworkStatsForTests } from './networkStats'
import type { PkpClient } from '../pkp/client'
import { makePkpClient } from '@/test-utils/pkpClient'

function makeStats(overrides: Partial<Awaited<ReturnType<PkpClient['getOperationsStatistics']>>> = {}) {
  return {
    generatedAt: '2026-08-26T12:00:00Z',
    totalTrains: 100,
    notStarted: 20,
    inProgress: 30,
    completed: 45,
    cancelled: 3,
    partialCancelled: 2,
    ...overrides,
  }
}

/**
 * Wspólna atrapa (`makePkpClient`) ma domyślne odpowiedzi PUSTE. Widżet stanu
 * sieci potrzebuje trzech konkretnych źródeł, więc podaje je tutaj raz —
 * zamiast powtarzać w każdym teście.
 */
function makeClient(overrides: Partial<PkpClient> = {}): PkpClient {
  return makePkpClient({
    getNameDictionaries: vi.fn().mockResolvedValue({ carrierNames: { IC: 'PKP Intercity' }, categoryNames: {} }),
    getOperationsStatistics: vi.fn().mockResolvedValue(makeStats()),
    getDailyCarrierCounts: vi.fn().mockResolvedValue({ IC: 10, KM: 5, PR: 3, KS: 1 }),
    getDisruptionCount: vi.fn().mockResolvedValue(4),
    ...overrides,
  })
}

beforeEach(() => {
  resetNetworkStatsForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-26T12:00:00+02:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getNetworkStats', () => {
  it('combines the three data sources into one payload, with resolved carrier names', async () => {
    const client = makeClient()

    const stats = await getNetworkStats(client)

    expect(stats.statistics?.totalTrains).toBe(100)
    expect(stats.statistics?.onTimePct).toBe(95) // (100 - 3 - 2) / 100
    expect(stats.disruptionCount).toBe(4)
    expect(stats.topCarriers).toEqual([
      { code: 'IC', name: 'PKP Intercity', count: 10 },
      { code: 'KM', name: null, count: 5 },
      { code: 'PR', name: null, count: 3 },
    ])
  })

  it('caches each element independently and does not refetch within its TTL', async () => {
    const client = makeClient()

    await getNetworkStats(client)
    await getNetworkStats(client)

    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(1)
    expect(client.getDailyCarrierCounts).toHaveBeenCalledTimes(1)
    expect(client.getDisruptionCount).toHaveBeenCalledTimes(1)
  })

  it('refetches statistics after the 15-minute TTL expires, but not the daily carrier breakdown', async () => {
    const client = makeClient()

    await getNetworkStats(client)
    vi.advanceTimersByTime(16 * 60 * 1000)
    await getNetworkStats(client)

    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(2)
    expect(client.getDailyCarrierCounts).toHaveBeenCalledTimes(1)
  })

  it('degrades to the last known statistics when a refresh fails, instead of throwing or zeroing out', async () => {
    const client = makeClient()
    await getNetworkStats(client)

    vi.advanceTimersByTime(16 * 60 * 1000)
    vi.mocked(client.getOperationsStatistics).mockRejectedValueOnce(new Error('PKP niedostępne'))

    const stats = await getNetworkStats(client)

    expect(stats.statistics?.totalTrains).toBe(100) // ostatnia znana wartość, nie 0
  })

  it('appends a history point only when statistics are actually refetched, not on cache hits', async () => {
    const client = makeClient()

    await getNetworkStats(client)
    await getNetworkStats(client) // cache hit -- nie powinno dodać drugiego punktu
    vi.advanceTimersByTime(16 * 60 * 1000)
    const third = await getNetworkStats(client)

    expect(third.history).toHaveLength(2)
  })

  it('statistics unknown: reports null, not zero, when the statistics request has never succeeded', async () => {
    const client = makeClient({
      getOperationsStatistics: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
      getDailyCarrierCounts: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
    })

    const stats = await getNetworkStats(client)

    expect(stats.statistics).toBeNull()
    expect(stats.topCarriers).toEqual([])
    expect(stats.history).toEqual([])
  })

  it('disruption count unknown: reports null, not zero, when the disruption request has never succeeded', async () => {
    const client = makeClient({
      getDisruptionCount: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
    })

    const stats = await getNetworkStats(client)

    expect(stats.disruptionCount).toBeNull()
    expect(stats.statistics?.totalTrains).toBe(100) // podzapytania degradują niezależnie
  })

  it('0 trains: on-time % is unknown (null), not a false 100%, and no history point is pushed', async () => {
    const client = makeClient({
      getOperationsStatistics: vi
        .fn()
        .mockResolvedValue(makeStats({ totalTrains: 0, notStarted: 0, inProgress: 0, completed: 0, cancelled: 0, partialCancelled: 0 })),
    })

    const stats = await getNetworkStats(client)

    expect(stats.statistics?.totalTrains).toBe(0)
    expect(stats.statistics?.onTimePct).toBeNull()
    expect(stats.history).toEqual([])
  })

  it('concurrent requests share one PKP call per sub-request', async () => {
    const client = makeClient()

    const [first, second] = await Promise.all([getNetworkStats(client), getNetworkStats(client)])

    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(1)
    expect(client.getDailyCarrierCounts).toHaveBeenCalledTimes(1)
    expect(client.getDisruptionCount).toHaveBeenCalledTimes(1)
    // Jedno realne odświeżenie -- jeden punkt historii, nie dwa (po jednym na callera).
    expect(first.history).toHaveLength(1)
    expect(second.history).toHaveLength(1)
  })

  it('failure backs off for 60 s', async () => {
    const client = makeClient({
      getOperationsStatistics: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
    })

    const first = await getNetworkStats(client)
    expect(first.statistics).toBeNull()
    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30 * 1000) // wciąż w oknie backoffu
    await getNetworkStats(client)
    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(1) // bez nowej próby

    vi.advanceTimersByTime(31 * 1000) // łącznie >60s -- backoff minął
    await getNetworkStats(client)
    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(2)
  })

  it("after midnight yesterday's statistics are not served", async () => {
    vi.setSystemTime(new Date('2026-08-26T23:59:00+02:00'))
    const client = makeClient()
    await getNetworkStats(client) // dzień 1, cache świeży (TTL 15 min)

    // Nowy dzień warszawski, ale TTL statystyk (15 min) jeszcze by nie wygasł --
    // sam TTL nie chroniłby przed serwowaniem wczorajszej wartości.
    vi.setSystemTime(new Date('2026-08-27T00:05:00+02:00'))
    vi.mocked(client.getOperationsStatistics).mockRejectedValueOnce(new Error('PKP niedostępne'))

    const stats = await getNetworkStats(client)

    expect(client.getOperationsStatistics).toHaveBeenCalledTimes(2) // próbuje odświeżyć, nie serwuje z cache
    expect(stats.statistics).toBeNull() // a po nieudanym odświeżeniu -- null, nie wczorajsza wartość
  })

  it('history resets on day change', async () => {
    vi.setSystemTime(new Date('2026-08-26T12:00:00+02:00'))
    const client = makeClient()
    const day1 = await getNetworkStats(client)
    expect(day1.history).toHaveLength(1)

    vi.setSystemTime(new Date('2026-08-27T12:00:00+02:00'))
    vi.mocked(client.getOperationsStatistics).mockResolvedValueOnce(makeStats({ generatedAt: '2026-08-27T12:00:00Z' }))

    const day2 = await getNetworkStats(client)

    expect(day2.history).toHaveLength(1) // nie 2 -- wczorajsza historia wyczyszczona
    expect(day2.history[0].at).toBe('2026-08-27T12:00:00Z')
  })
})
