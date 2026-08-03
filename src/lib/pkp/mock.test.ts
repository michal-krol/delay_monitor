import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('returns only trains that stop at one of the requested station ids', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5136'])
    expect(result.trains.every((train) => train.stations.some((stop) => stop.stationId === '5136'))).toBe(true)
    expect(result.trains.length).toBeGreaterThan(0)
  })

  it('returns the station name dictionary bundled with the fixture', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5100'])
    expect(result.stationNames['5100']).toBe('Warszawa Centralna')
  })

  it('rebases fixture timestamps to be close to now', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5100'])
    const stop = result.trains.flatMap((train) => train.stations).find((s) => s.plannedDeparture !== null)
    expect(stop).toBeDefined()
    const plannedMs = new Date(stop!.plannedDeparture as string).getTime()
    expect(Math.abs(plannedMs - Date.now())).toBeLessThan(60 * 60 * 1000)
  })

  it('returns a stable mock budget', async () => {
    const client = createMockClient()
    const result = await client.getOperations(['5100'])
    expect(result.budget).toEqual({ hourly: 99, daily: 999 })
  })

  it('returns schedules only for trains that stop at the requested stations', async () => {
    const client = createMockClient()
    const routes = await client.getSchedules(['5136'])
    expect(routes.map((route) => route.orderId).sort()).toEqual(['12345', '67890'])
    expect(routes.every((route) => route.scheduleId === '26')).toBe(true)
  })

  it('carries carrier and category codes on each route', async () => {
    const client = createMockClient()
    const routes = await client.getSchedules(['5100'])
    const eic = routes.find((route) => route.orderId === '12345')
    expect(eic).toEqual({ scheduleId: '26', orderId: '12345', carrierCode: 'IC', commercialCategorySymbol: 'EIC', name: 'EIC Grunwald', nationalNumber: null })
  })

  describe('warm-up robustness', () => {
    afterEach(() => {
      vi.doUnmock('node:fs/promises')
      vi.resetModules()
    })

    it('does not raise an unhandled rejection when a fixture fails to load', async () => {
      // createMockClient() odpala rozgrzewkę słownika stacji jako "fire and
      // forget" (bez await), żeby /api/stations nie czekało na pierwsze
      // wejście/wyjście. Bez .catch() nieudane parsowanie fixture'a (uszkodzony
      // JSON, błąd walidacji Zod) staje się nieobsłużonym odrzuceniem obietnicy,
      // nie cichym brakiem danych — sprawdzone eksperymentalnie w Node.
      //
      // Świeży import modułu pod zamockowanym fs, żeby nie zepsuć pamięci
      // podręcznej fixture'ów współdzielonej przez pozostałe testy w tym pliku.
      vi.resetModules()
      vi.doMock('node:fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('fixture uszkodzony')),
      }))

      const onUnhandledRejection = vi.fn()
      process.on('unhandledRejection', onUnhandledRejection)

      try {
        const freshMock = await import('./mock')
        freshMock.createMockClient()

        // Kolejka mikrozadań musi się przewinąć, żeby Node zdążył odpalić
        // unhandledRejection, jeśli miałby to zrobić.
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(onUnhandledRejection).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', onUnhandledRejection)
      }
    })

    it('still propagates the failure to a real caller after the warm-up swallowed it', async () => {
      // .catch() na rozgrzewce nie może po cichu połknąć prawdziwych wywołań —
      // searchStations musi nadal odrzucić, żeby /api/stations mogło zwrócić 503.
      vi.resetModules()
      vi.doMock('node:fs/promises', () => ({
        readFile: vi.fn().mockRejectedValue(new Error('fixture uszkodzony')),
      }))

      const freshMock = await import('./mock')
      const client = freshMock.createMockClient()

      await expect(client.searchStations('warszawa')).rejects.toThrow('fixture uszkodzony')
    })
  })
})
