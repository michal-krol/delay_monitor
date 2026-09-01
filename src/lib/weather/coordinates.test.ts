import { beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE = {
  '33605': { name: 'Warszawa Centralna', lat: 52.2288207, lon: 21.00316, source: 'station' },
  '999999': { name: 'Stacja bez współrzędnych', lat: null, lon: null, source: 'failed' },
}

const readFile = vi.fn().mockResolvedValue(JSON.stringify(FIXTURE))
vi.mock('node:fs/promises', () => ({ readFile: (...args: unknown[]) => readFile(...args) }))

// Moduł ma stan modułowy (`once()`) -- świeży import na każdy test, żeby
// testy się nie widziały nawzajem przez współdzieloną pamięć podręczną.
beforeEach(() => {
  vi.resetModules()
  readFile.mockClear()
})

describe('getStationCoordinates', () => {
  it('returns coordinates for a known, geocoded station', async () => {
    const { getStationCoordinates } = await import('./coordinates')
    expect(await getStationCoordinates('33605')).toEqual({ lat: 52.2288207, lon: 21.00316 })
  })

  it('returns null for a station with lat/lon null (failed geocoding)', async () => {
    const { getStationCoordinates } = await import('./coordinates')
    expect(await getStationCoordinates('999999')).toBeNull()
  })

  it('returns null for a stationId not present in the file at all', async () => {
    const { getStationCoordinates } = await import('./coordinates')
    expect(await getStationCoordinates('0')).toBeNull()
  })

  it('reads the file only once, no matter how many concurrent lookups happen (once() memoization)', async () => {
    const { getStationCoordinates } = await import('./coordinates')
    await Promise.all([getStationCoordinates('33605'), getStationCoordinates('999999'), getStationCoordinates('33605')])
    expect(readFile).toHaveBeenCalledTimes(1)
  })

  // AGENTS.md #7: „nie udało się wczytać pliku" to inny stan niż „ta stacja
  // nie ma współrzędnych". `null` dla obu renderowałoby się identycznie.
  it('throws when the coordinates file cannot be read, instead of pretending the station has no location', async () => {
    readFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const { getStationCoordinates } = await import('./coordinates')
    await expect(getStationCoordinates('33605')).rejects.toThrow('ENOENT')
  })

  it('retries the read after a failure rather than staying broken until the process restarts', async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getStationCoordinates } = await import('./coordinates')

    await expect(getStationCoordinates('33605')).rejects.toThrow('ENOENT')
    expect(await getStationCoordinates('33605')).toEqual({ lat: 52.2288207, lon: 21.00316 })
    expect(readFile).toHaveBeenCalledTimes(2)
  })
})
