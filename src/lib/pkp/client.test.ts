import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveClient, PkpApiError } from './client'

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createLiveClient', () => {
  it('sends the X-API-Key header and fetches the full station list once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stations: [{ id: '5100', name: 'Warszawa Centralna' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('Warszawa')

    expect(results).toEqual([{ id: '5100', name: 'Warszawa Centralna' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/dictionaries/stations?pageSize=10000')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('secret-key')
  })

  it('filters by substring anywhere in the name, not just the start', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        stations: [
          { id: '1', name: 'Warszawa Centralna' },
          { id: '2', name: 'Nowa Warszawa' },
          { id: '3', name: 'Kraków Główny' },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('warszawa')

    expect(results.map((station) => station.name)).toEqual(['Warszawa Centralna', 'Nowa Warszawa'])
  })

  it('fetches the station list only once across multiple searches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stations: [{ id: '1', name: 'Warszawa Centralna' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.searchStations('warszawa')
    await client.searchStations('kraków')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops stations with a null name (the API documents the field as nullable)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ stations: [{ id: '1', name: 'Warszawa Centralna' }, { id: '2', name: null }] })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const results = await client.searchStations('')

    expect(results).toEqual([{ id: '1', name: 'Warszawa Centralna' }])
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

  it('reports an absent rate-limit header as unknown, not as an exhausted budget', async () => {
    // Regresja: Number(null ?? '0') dawało 0, więc API bez tych nagłówków
    // wyglądało jak wyczerpany limit i poller zwalniał do 5 minut na stałe.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ trains: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: null, daily: null })
  })

  it('reports an unparsable rate-limit header as unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ trains: [] }, { 'X-RateLimit-Hourly-Remaining': 'brak', 'X-RateLimit-Daily-Remaining': '  ' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: null, daily: null })
  })

  it('still reports a genuine zero as zero', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ trains: [] }, { 'X-RateLimit-Hourly-Remaining': '0', 'X-RateLimit-Daily-Remaining': '0' })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const result = await client.getOperations(['5100'])

    expect(result.budget).toEqual({ hourly: 0, daily: 0 })
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

  it('fetches routes for the requested stations and parses carrier/category', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [{ scheduleId: 25, orderId: 118845, carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC' }],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    const routes = await client.getSchedules(['5100', '5136'])

    expect(routes).toEqual([{ scheduleId: '25', orderId: '118845', carrierCode: 'PKP_IC', commercialCategorySymbol: 'EIC' }])
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/schedules?stations=5100,5136')
  })

  it('caches schedules per station set regardless of id order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100', '5136'])
    await client.getSchedules(['5136', '5100'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches schedules for a different station set', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    await client.getSchedules(['5100'])
    await client.getSchedules(['4900'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not let the schedules cache grow without bound', async () => {
    // Klucz to zestaw obserwowanych stacji, więc każda zmiana ulubionych
    // dokładała wpis, którego nic nigdy nie usuwało.
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ routes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLiveClient('secret-key')
    for (let i = 0; i < 200; i += 1) {
      await client.getSchedules([`stacja-${i}`])
    }
    expect(fetchMock).toHaveBeenCalledTimes(200)

    // Najstarsze zestawy zostały wyeksmitowane, więc trzeba je pobrać ponownie...
    await client.getSchedules(['stacja-0'])
    expect(fetchMock).toHaveBeenCalledTimes(201)

    // ...a najświeższe wciąż siedzą w cache'u.
    await client.getSchedules(['stacja-199'])
    expect(fetchMock).toHaveBeenCalledTimes(201)
  })
})
