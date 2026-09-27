import { describe, expect, it } from 'vitest'
import { mergeGtfsStations, TIER_RANKS } from './gtfsStations.mjs'

const station = (id, overrides = {}) => ({
  id, secondaryId: '', lat: 52.1234567, lon: 21.7654321, ...overrides,
})

describe('mergeGtfsStations', () => {
  it('overwrites coordinates by id and by plk_secondary_id, keeping the PKP name', () => {
    const existing = {
      '33605': { name: 'Warszawa Centralna', lat: 52.2, lon: 21.0, source: 'city-fallback' },
      '36129': { name: 'Warszawa Praga', lat: 52.2, lon: 21.0, source: 'city-fallback' },
      '999': { name: 'Nietknięta', lat: 50, lon: 19, source: 'station' },
    }
    const { merged, updated } = mergeGtfsStations(
      [station('33605'), station('201092', { secondaryId: '36129' })],
      new Map(),
      existing
    )
    expect(merged['33605']).toEqual({ name: 'Warszawa Centralna', lat: 52.123457, lon: 21.765432, source: 'gtfs', tier: 1 })
    expect(merged['36129'].source).toBe('gtfs')
    expect(merged['36129'].name).toBe('Warszawa Praga')
    expect(merged['999']).toEqual(existing['999'])
    expect(merged['201092']).toBeUndefined()
    expect(updated).toBe(2)
  })

  it('skips stations absent from the PLK-keyed file (e.g. KM-only id 0)', () => {
    const { merged } = mergeGtfsStations([station('0')], new Map(), {})
    expect(merged).toEqual({})
  })

  it('assigns tiers by event rank', () => {
    const stations = Array.from({ length: TIER_RANKS.tier2 + 1 }, (_, i) => station(String(i)))
    const events = new Map(stations.map((s, i) => [s.id, 10_000 - i]))
    const existing = Object.fromEntries(stations.map((s) => [s.id, { name: s.id, lat: null, lon: null, source: 'failed' }]))
    const { merged } = mergeGtfsStations(stations, events, existing)
    expect(merged['0'].tier).toBe(1)
    expect(merged[String(TIER_RANKS.tier1)].tier).toBe(2)
    expect(merged[String(TIER_RANKS.tier2)].tier).toBe(3)
  })
})
