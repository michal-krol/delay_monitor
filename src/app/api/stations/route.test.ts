import { describe, expect, it, vi } from 'vitest'

const searchStations = vi.fn().mockResolvedValue([{ id: '5136', name: 'Kraków Główny' }])

vi.mock('@/lib/board/instance', () => ({
  client: { searchStations },
  rememberStationName: vi.fn(),
}))

describe('GET /api/stations', () => {
  it('returns an empty list for a blank query without calling the client', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/stations?q='))
    const body = await response.json()
    expect(body.stations).toEqual([])
    expect(searchStations).not.toHaveBeenCalled()
  })

  it('searches and caches results for a real query', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/stations?q=krak'))
    const body = await response.json()
    expect(body.stations).toEqual([{ id: '5136', name: 'Kraków Główny' }])
    expect(searchStations).toHaveBeenCalledWith('krak')
  })

  it('serves the second identical query from cache without calling the client again', async () => {
    const { GET } = await import('./route')
    await GET(new Request('http://localhost/api/stations?q=krak'))
    searchStations.mockClear()
    const response = await GET(new Request('http://localhost/api/stations?q=krak'))
    const body = await response.json()
    expect(body.stations).toEqual([{ id: '5136', name: 'Kraków Główny' }])
    expect(searchStations).not.toHaveBeenCalled()
  })
})
