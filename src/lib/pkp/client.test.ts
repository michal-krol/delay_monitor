import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveClient, PkpApiError } from './client'

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createLiveClient', () => {
  it('sends the X-API-Key header and parses station search results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stations: [{ id: '5100', name: 'Warszawa Centralna' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('Warszawa')

    expect(results).toEqual([{ id: '5100', name: 'Warszawa Centralna' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/dictionaries/stations?search=Warszawa')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('secret-key')
  })

  it('reads the rate-limit budget from response headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { trains: [] },
        { 'X-RateLimit-Hourly-Remaining': '42', 'X-RateLimit-Daily-Remaining': '901' }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: 42, daily: 901 })
  })

  it('joins multiple station ids into one query and requests withPlanned=true and fullRoutes=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getOperations(['5100', '5136'])

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('stations=5100,5136')
    expect(String(url)).toContain('withPlanned=true')
    expect(String(url)).toContain('fullRoutes=true')
  })

  it('returns the parsed trains list and station name dictionary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        trains: [{ scheduleId: 25, orderId: 1, stations: [{ stationId: 5100, plannedDeparture: '2026-08-01T12:15:00+02:00' }] }],
        stations: { '5100': 'Warszawa Centralna' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.trains).toHaveLength(1)
    expect(result.trains[0].scheduleId).toBe('25')
    expect(result.stationNames).toEqual({ '5100': 'Warszawa Centralna' })
  })

  it('throws PkpApiError with the response status on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('bad-key')
    await expect(client.getOperations(['5100'])).rejects.toMatchObject({ status: 401 })
    await expect(client.getOperations(['5100'])).rejects.toBeInstanceOf(PkpApiError)
  })
})
