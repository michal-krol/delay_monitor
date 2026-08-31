import { describe, expect, it, vi } from 'vitest'

const FEEDS = {
  operations: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 42 },
  schedules: { ok: true, lastSuccessAt: '2026-08-01T12:00:00.000Z', records: 7, usedFullRouteFallback: false },
  disruptions: { ok: false, lastSuccessAt: null, records: null },
  dataVersion: null,
}

vi.mock('@/lib/board/instance', () => ({
  appConfig: { dataSource: 'mock' },
  poller: {
    isAwake: vi.fn(() => false),
    getStatus: vi.fn(() => 'ok'),
    isThrottled: vi.fn(() => false),
    getIntervalMs: vi.fn(() => 90000),
    getBudget: vi.fn(() => ({ hourly: 62, daily: 702, hourlyLimit: 100, dailyLimit: 1000 })),
    getDiagnostics: vi.fn(() => FEEDS),
  },
}))

describe('GET /api/health', () => {
  it('reports data source, poller state, pace and the PKP budget', async () => {
    const { GET } = await import('./route')
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({
      dataSource: 'mock',
      pollerAwake: false,
      pollerStatus: 'ok',
      throttled: false,
      intervalMs: 90000,
      budget: { hourly: 62, daily: 702, hourlyLimit: 100, dailyLimit: 1000 },
      feeds: FEEDS,
    })
  })

  // Sedno tej sekcji: `pollerStatus` bywa 'ok', gdy rozkład albo utrudnienia
  // padły -- ich awarie są łapane lokalnie i degradują cicho. Bez rozbicia na
  // źródła nie dało się odczytać, które z nich zawodzi.
  it('reports each feed separately, so a silent schedules failure is visible', async () => {
    const { GET } = await import('./route')
    const body = await (await GET()).json()

    expect(body.pollerStatus).toBe('ok')
    expect(body.feeds.operations.ok).toBe(true)
    expect(body.feeds.disruptions.ok).toBe(false)
    // „Nigdy się nie udało" to null, nie zero -- AGENTS.md #3.
    expect(body.feeds.disruptions.records).toBeNull()
    expect(body.feeds.dataVersion).toBeNull()
  })

  // Poller nie ma budżetu, dopóki nie wykonał pierwszego przebiegu. To musi
  // dojechać do klienta jako „nie wiadomo", nie zniknąć po cichu i nie stać
  // się zerem (AGENTS.md #3).
  it('passes an unknown budget through as null instead of dropping the field', async () => {
    vi.resetModules()
    vi.doMock('@/lib/board/instance', () => ({
      appConfig: { dataSource: 'live' },
      poller: {
        isAwake: vi.fn(() => true),
        getStatus: vi.fn(() => 'degraded'),
        isThrottled: vi.fn(() => true),
        getIntervalMs: vi.fn(() => 300000),
        getBudget: vi.fn(() => undefined),
        getDiagnostics: vi.fn(() => FEEDS),
      },
    }))

    const { GET } = await import('./route')
    const body = await (await GET()).json()

    expect(body.budget).toBeNull()
    expect(body.throttled).toBe(true)
    expect(body.intervalMs).toBe(300000)
  })

})
