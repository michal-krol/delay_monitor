import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchVehicleFeed, mockVehicleFeed } from './vehicleClient'
import { getCity } from './cities'

describe('fetchVehicleFeed', () => {
  it('fetches, parses and returns positions', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          time: 't',
          positions: [{ lat: 1, lon: 2, trip_id: 'a', side_number: '9', timestamp: 'ts' }],
        }),
        { status: 200 },
      ),
    )
    const r = await fetchVehicleFeed('https://x/vehicles.json', fakeFetch as unknown as typeof fetch)
    expect(r.positions).toHaveLength(1)
    expect(fakeFetch).toHaveBeenCalledWith('https://x/vehicles.json', expect.any(Object))
  })

  it('throws on a non-2xx response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      fetchVehicleFeed('https://x/vehicles.json', fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow()
  })
})

describe('mockVehicleFeed', () => {
  it('reads the fixture and substitutes the timestamp so age is fresh', async () => {
    const feed = mockVehicleFeed(getCity('warszawa')!)
    const r = await feed()
    expect(r.positions.length).toBeGreaterThanOrEqual(1)
    expect(Date.now() - Date.parse(r.positions[0].timestamp)).toBeLessThan(60_000)
  })

  it('returns an empty result when the fixture is missing', async () => {
    const feed = mockVehicleFeed(getCity('warszawa')!, 'no/such/root')
    expect(await feed()).toEqual({ positions: [], droppedPositions: 0, feedTime: null })
  })

  it('degrades to an empty result when the fixture is malformed, not a throw', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'veh-'))
    mkdirSync(path.join(root, 'warszawa'))
    writeFileSync(path.join(root, 'warszawa', 'vehicles.json'), '{ not json')
    const feed = mockVehicleFeed(getCity('warszawa')!, root)
    expect(await feed()).toEqual({ positions: [], droppedPositions: 0, feedTime: null })
  })
})
