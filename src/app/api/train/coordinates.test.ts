import { describe, expect, it, vi } from 'vitest'
import type { TrainDetailStop } from '@/lib/board/trainDetail'

vi.mock('@/lib/weather/coordinates', () => ({
  getStationCoordinates: vi.fn(async (stationId: string) =>
    stationId === '33605' ? { lat: 52.2288207, lon: 21.00316 } : null
  ),
}))

function stop(stationId: string): TrainDetailStop {
  return {
    stationId,
    stationName: stationId,
    plannedArrival: null,
    actualArrival: null,
    arrivalDelayMinutes: null,
    plannedDeparture: null,
    actualDeparture: null,
    departureDelayMinutes: null,
    isCancelled: false,
    isConfirmed: false,
    platform: null,
    track: null,
    hasTrainStarted: false,
    estimatedDelayMinutes: null,
    predictedArrival: null,
    predictedDeparture: null,
    disruptionMessages: [],
    stopMinutes: null,
    stopTypeName: null,
  }
}

describe('attachStopCoordinates', () => {
  it('attaches known coordinates and preserves every existing field', async () => {
    const { attachStopCoordinates } = await import('./coordinates')
    const [result] = await attachStopCoordinates([stop('33605')])
    expect(result).toEqual({ ...stop('33605'), lat: 52.2288207, lon: 21.00316 })
  })

  it('sets lat/lon to null for a station with no coordinates, without dropping the stop', async () => {
    const { attachStopCoordinates } = await import('./coordinates')
    const [result] = await attachStopCoordinates([stop('999999')])
    expect(result.lat).toBeNull()
    expect(result.lon).toBeNull()
    expect(result.stationId).toBe('999999')
  })

  it('preserves stop order across concurrent lookups', async () => {
    const { attachStopCoordinates } = await import('./coordinates')
    const result = await attachStopCoordinates([stop('999999'), stop('33605'), stop('999999')])
    expect(result.map((s) => s.lat)).toEqual([null, 52.2288207, null])
  })

  it('returns an empty array for an empty input, without calling the lookup', async () => {
    const { getStationCoordinates } = await import('@/lib/weather/coordinates')
    vi.mocked(getStationCoordinates).mockClear()
    const { attachStopCoordinates } = await import('./coordinates')
    expect(await attachStopCoordinates([])).toEqual([])
    expect(getStationCoordinates).not.toHaveBeenCalled()
  })
})
