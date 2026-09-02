import { describe, expect, it, vi } from 'vitest'
import type { CityFeed } from './cities'
import { createLiveClient, isRangeRequestUnsupportedError } from './client'
import { buildZip, rangeResponder } from '@/test-utils/zip'

const CITY: CityFeed = {
  id: 'test',
  name: 'Test',
  staticUrl: 'https://feed.example/gtfs.zip',
  vehiclesUrl: null,
  alertsUrl: null,
  railStationPrefix: 'Test ',
  timezone: 'Europe/Warsaw',
}

const FEED_INFO = Buffer.from('feed_publisher_name,feed_version\nmkuran,2026-09-02:1\n', 'utf8')
const STOPS = Buffer.from('stop_id,stop_name\n100101,Centrum\n100102,Centrum\n', 'utf8')

function archive() {
  return buildZip([
    { name: 'feed_info.txt', data: FEED_INFO, method: 0 },
    { name: 'stops.txt', data: STOPS, method: 8, localExtraLength: 4 },
  ])
}

async function collect(stream: AsyncIterable<string> | null): Promise<string[]> {
  if (stream === null) return []
  const out: string[] = []
  for await (const line of stream) out.push(line)
  return out
}

describe('createLiveClient', () => {
  it('reads the central directory with a suffix range, then streams an inflated entry', async () => {
    const fetchSpy = vi.fn(rangeResponder(archive()))
    const client = createLiveClient(CITY, { fetch: fetchSpy })

    const lines = await collect(await client.readEntry('stops.txt'))
    expect(lines).toEqual(['stop_id,stop_name', '100101,Centrum', '100102,Centrum'])

    // Pierwsze żądanie to suffix range na ogon; kolejne niosą If-Range z ETagiem.
    expect(fetchSpy.mock.calls[0][1].Range).toBe('bytes=-65536')
    expect(fetchSpy.mock.calls[0][1]['If-Range']).toBeUndefined()
    expect(fetchSpy.mock.calls[0][1]['User-Agent']).toMatch(/delay-monitor/)
    for (const call of fetchSpy.mock.calls.slice(1)) {
      expect(call[1]['If-Range']).toBe('"abc123"')
    }
  })

  it('reads feed_version from a stored (method 0) feed_info.txt', async () => {
    const client = createLiveClient(CITY, { fetch: rangeResponder(archive()) })
    expect(await client.getFeedVersion()).toBe('2026-09-02:1')
  })

  it('returns null for an entry the archive does not carry', async () => {
    const client = createLiveClient(CITY, { fetch: rangeResponder(archive()) })
    expect(await client.readEntry('calendar.txt')).toBeNull()
  })

  it('rejects loudly when the server answers 200 instead of 206 (CDN ignored Range / feed changed)', async () => {
    const client = createLiveClient(CITY, { fetch: rangeResponder(archive(), { ignoreRange: true }) })
    await expect(client.readEntry('stops.txt')).rejects.toSatisfy(isRangeRequestUnsupportedError)
  })

  it('rejects loudly when Content-Range is missing from a 206', async () => {
    const client = createLiveClient(CITY, {
      fetch: async () => new Response(new Uint8Array(10), { status: 206, headers: { etag: '"x"' } }),
    })
    await expect(client.getFeedVersion()).rejects.toSatisfy(isRangeRequestUnsupportedError)
  })
})
