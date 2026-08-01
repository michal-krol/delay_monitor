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

  it('searches for a real query', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/stations?q=krak'))
    const body = await response.json()
    expect(body.stations).toEqual([{ id: '5136', name: 'Kraków Główny' }])
    expect(searchStations).toHaveBeenCalledWith('krak')
  })

  it('caps the results at 10 suggestions', async () => {
    const manyStations = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `Stacja ${i}` }))
    searchStations.mockResolvedValueOnce(manyStations)
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/stations?q=stacja'))
    const body = await response.json()
    expect(body.stations).toHaveLength(10)
    expect(body.stations).toEqual(manyStations.slice(0, 10))
  })
})
