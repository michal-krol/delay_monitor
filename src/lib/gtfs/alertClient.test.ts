import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchAlertFeed, mockAlertFeed } from './alertClient'
import { getCity } from './cities'

describe('fetchAlertFeed', () => {
  it('fetches, parses and returns alerts', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ time: 't', alerts: [{ id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 't', body: 'b' }] }),
        { status: 200 },
      ),
    )
    const r = await fetchAlertFeed('https://x/alerts.json', fakeFetch as unknown as typeof fetch)
    expect(r.alerts).toHaveLength(1)
    expect(fakeFetch).toHaveBeenCalledWith('https://x/alerts.json', expect.any(Object))
  })

  it('throws on a non-2xx response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(fetchAlertFeed('https://x/alerts.json', fakeFetch as unknown as typeof fetch)).rejects.toThrow()
  })
})

describe('mockAlertFeed', () => {
  it('reads the fixture', async () => {
    const feed = mockAlertFeed(getCity('warszawa')!)
    const r = await feed()
    expect(r.alerts.length).toBeGreaterThanOrEqual(1)
    expect(r.alerts.some((a) => a.routes.includes('20'))).toBe(true)
  })

  it('returns an empty result when the fixture is missing', async () => {
    const feed = mockAlertFeed(getCity('warszawa')!, 'no/such/root')
    expect(await feed()).toEqual({ alerts: [], droppedAlerts: 0, feedTime: null })
  })

  it('degrades to an empty result when the fixture is malformed, not a throw', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'alr-'))
    mkdirSync(path.join(root, 'warszawa'))
    writeFileSync(path.join(root, 'warszawa', 'alerts.json'), '{ not json')
    const feed = mockAlertFeed(getCity('warszawa')!, root)
    expect(await feed()).toEqual({ alerts: [], droppedAlerts: 0, feedTime: null })
  })
})
