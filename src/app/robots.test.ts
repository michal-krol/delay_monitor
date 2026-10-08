import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from './robots'

afterEach(() => vi.unstubAllEnvs())

describe('robots.txt', () => {
  it('allows the site, keeps crawlers out of /api/ and points at the sitemap on the public domain', () => {
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', 'delay.example.app')
    const r = robots()
    expect(r.rules).toEqual({ userAgent: '*', allow: '/', disallow: '/api/' })
    expect(r.sitemap).toBe('https://delay.example.app/sitemap.xml')
  })

  it('omits the sitemap line when the public domain is unknown (local dev) instead of inventing a host', () => {
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', '')
    expect(robots().sitemap).toBeUndefined()
  })
})
