import { describe, expect, it } from 'vitest'
import { createMockClient } from './mock'

describe('createMockClient', () => {
  it('filters station search by case-insensitive substring', async () => {
    const client = createMockClient()
    const results = await client.searchStations('kraków')
    expect(results).toEqual([{ id: '5136', name: 'Kraków Główny' }])
  })

  it('returns all stations for an empty query', async () => {
    const client = createMockClient()
    const results = await client.searchStations('')
    expect(results.length).toBeGreaterThanOrEqual(3)
  })

  it('returns only operations for the requested station ids', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5136'])
    expect(result.operations.every((op) => op.stationId === '5136')).toBe(true)
    expect(result.operations.length).toBeGreaterThan(0)
  })

  it('rebases fixture timestamps to be close to now', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5100'])
    const departure = result.operations.find((op) => op.stop.plannedDeparture !== null)
    expect(departure).toBeDefined()
    const plannedMs = new Date(departure!.stop.plannedDeparture as string).getTime()
    expect(Math.abs(plannedMs - Date.now())).toBeLessThan(60 * 60 * 1000)
  })

  it('returns a stable mock budget', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5100'])
    expect(result.budget).toEqual({ hourly: 99, daily: 999 })
  })
})
