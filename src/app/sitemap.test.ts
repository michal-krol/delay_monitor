import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAllStationIds = vi.fn<() => Promise<string[]>>()
vi.mock('@/lib/weather/coordinates', () => ({ getAllStationIds: () => getAllStationIds() }))
const client = vi.hoisted(() => ({ searchStations: vi.fn(), getBoard: vi.fn() }))
vi.mock('@/lib/board/instance', () => ({ client }))

import sitemap from './sitemap'

beforeEach(() => {
  vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', 'delay.example.app')
  getAllStationIds.mockResolvedValue(['33605', '80416'])
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('sitemap.xml', () => {
  it('lists the home page, every station from the static dictionary and the pages of every registered city, all absolute', async () => {
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain('https://delay.example.app/')
    expect(urls).toContain('https://delay.example.app/station/33605')
    expect(urls).toContain('https://delay.example.app/station/80416')
    expect(urls).toContain('https://delay.example.app/city/warszawa')
    expect(urls).toContain('https://delay.example.app/city/warszawa/lines')
    expect(urls).toContain('https://delay.example.app/city/warszawa/map')
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('costs zero PKP requests (#3): reads only static data, never touches the PKP client', async () => {
    await sitemap()
    expect(client.searchStations).not.toHaveBeenCalled()
    expect(client.getBoard).not.toHaveBeenCalled()
  })

  it('skips ids that do not match the station pattern (hostile or corrupted dictionary entries)', async () => {
    getAllStationIds.mockResolvedValue(['33605', '../etc', '12 34', ''])
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls.filter((url) => url.includes('/station/'))).toEqual(['https://delay.example.app/station/33605'])
  })

  it('without a known public domain falls back to localhost rather than relative URLs', async () => {
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', '')
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls.every((url) => url.startsWith('http://localhost:3000/'))).toBe(true)
  })

  it('stays within the 50 000-URL protocol limit even for a full dictionary', async () => {
    getAllStationIds.mockResolvedValue(Array.from({ length: 60_000 }, (_, i) => String(i + 1)))
    expect((await sitemap()).length).toBeLessThanOrEqual(50_000)
  })
})
