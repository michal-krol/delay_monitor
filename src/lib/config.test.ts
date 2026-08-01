import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('defaults to mock when no API key is set', () => {
    const config = loadConfig({})
    expect(config.dataSource).toBe('mock')
    expect(config.pollIntervalMs).toBe(90000)
    expect(config.interestTtlMs).toBe(300000)
    expect(config.port).toBe(3000)
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
    const config = loadConfig({ POLL_INTERVAL_MS: '30000', INTEREST_TTL_MS: '60000', PORT: '4000' })
    expect(config.pollIntervalMs).toBe(30000)
    expect(config.interestTtlMs).toBe(60000)
    expect(config.port).toBe(4000)
  })
})
