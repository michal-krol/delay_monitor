import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('defaults to mock when no API key is set', () => {
    const config = loadConfig({})
    expect(config.dataSource).toBe('mock')
    expect(config.pollIntervalMs).toBe(90000)
    expect(config.interestTtlMs).toBe(300000)
  })

  it('defaults to live when an API key is present and PKP_DATA_SOURCE=auto', () => {
    const config = loadConfig({ PKP_API_KEY: 'secret' })
    expect(config.dataSource).toBe('live')
  })

  it('respects an explicit mock override even with a key present', () => {
    const config = loadConfig({ PKP_API_KEY: 'secret', PKP_DATA_SOURCE: 'mock' })
    expect(config.dataSource).toBe('mock')
  })

  it('throws when PKP_DATA_SOURCE=live and no key is present', () => {
    expect(() => loadConfig({ PKP_DATA_SOURCE: 'live' })).toThrow()
  })

  it('parses numeric overrides from string env vars', () => {
    const config = loadConfig({ POLL_INTERVAL_MS: '30000', INTEREST_TTL_MS: '60000' })
    expect(config.pollIntervalMs).toBe(30000)
    expect(config.interestTtlMs).toBe(60000)
  })

  describe('GTFS', () => {
    it('defaults: enabled, mock, single city warszawa, 1h idle TTL, 15s vehicle poll, 5min alert poll', () => {
      const { gtfs } = loadConfig({})
      expect(gtfs).toEqual({
        enabled: true,
        cities: ['warszawa'],
        dataSource: 'mock',
        idleTtlMs: 3600000,
        vehiclePollMs: 15000,
        alertPollMs: 300000,
      })
    })

    it('parses GTFS_ALERT_POLL_MS from env', () => {
      expect(loadConfig({ GTFS_ALERT_POLL_MS: '60000' }).gtfs.alertPollMs).toBe(60000)
    })

    it('GTFS_ENABLED=false actually disables (not coerced to true)', () => {
      expect(loadConfig({ GTFS_ENABLED: 'false' }).gtfs.enabled).toBe(false)
      expect(loadConfig({ GTFS_ENABLED: '0' }).gtfs.enabled).toBe(false)
      expect(loadConfig({ GTFS_ENABLED: 'true' }).gtfs.enabled).toBe(true)
    })

    it('splits GTFS_CITIES on commas and trims blanks', () => {
      expect(loadConfig({ GTFS_CITIES: 'warszawa, krakow ,,wro' }).gtfs.cities).toEqual(['warszawa', 'krakow', 'wro'])
    })

    it('takes an explicit live data source without needing a key', () => {
      expect(loadConfig({ GTFS_DATA_SOURCE: 'live' }).gtfs.dataSource).toBe('live')
    })
  })
})
