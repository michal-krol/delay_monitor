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

    expect(stats.totalTrains).toBe(100)
    expect(stats.onTimePct).toBe(95) // (100 - 3 - 2) / 100
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

    expect(stats.totalTrains).toBe(100) // ostatnia znana wartość, nie 0
  })

  it('appends a history point only when statistics are actually refetched, not on cache hits', async () => {
    const client = makeClient()

    await getNetworkStats(client)
    await getNetworkStats(client) // cache hit -- nie powinno dodać drugiego punktu
    vi.advanceTimersByTime(16 * 60 * 1000)
    const third = await getNetworkStats(client)

    expect(third.history).toHaveLength(2)
  })

  it('returns zeroed defaults, not a crash, when nothing has ever succeeded', async () => {
    const client = makeClient({
      getOperationsStatistics: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
      getDailyCarrierCounts: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
      getDisruptionCount: vi.fn().mockRejectedValue(new Error('PKP niedostępne')),
    })

    const stats = await getNetworkStats(client)

    expect(stats.totalTrains).toBe(0)
    expect(stats.onTimePct).toBe(100)
    expect(stats.topCarriers).toEqual([])
    expect(stats.disruptionCount).toBe(0)
  })
})
