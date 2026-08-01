import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCached, setCached } from './stationSearchCache'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('stationSearchCache', () => {
  it('returns undefined for an uncached query', () => {
    expect(getCached('nowy-krakow')).toBeUndefined()
  })

  it('returns cached stations within 24h', () => {
    setCached('krakow', [{ id: '5136', name: 'Kraków Główny' }])
    expect(getCached('krakow')).toEqual([{ id: '5136', name: 'Kraków Główny' }])
  })

  it('expires entries after 24h', () => {
    setCached('krakow', [{ id: '5136', name: 'Kraków Główny' }])
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)
    expect(getCached('krakow')).toBeUndefined()
  })
})
