// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderShareImage } from './render'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

async function pngHead(response: Response): Promise<number[]> {
  return [...new Uint8Array(await response.arrayBuffer()).slice(0, 4)]
}

describe('renderShareImage', () => {
  it('generic card is a PNG with a short, non-immutable cache', async () => {
    const response = renderShareImage({ kind: 'generic' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    const cache = response.headers.get('cache-control') ?? ''
    expect(cache).toContain('max-age=300')
    expect(cache).not.toContain('immutable')
    expect(await pngHead(response)).toEqual(PNG_MAGIC)
  })

  it('place card caches for a day, not forever', async () => {
    const response = renderShareImage({ kind: 'place', label: 'Linia', title: '175', detail: 'Lotnisko — Żerań', mode: 'bus', city: 'Warszawa' })
    const cache = response.headers.get('cache-control') ?? ''
    expect(cache).toContain('max-age=86400')
    expect(cache).not.toContain('immutable')
    expect(await pngHead(response)).toEqual(PNG_MAGIC)
  })

  it('renders a long Polish title for every mode without throwing', async () => {
    for (const mode of ['metro', 'tram', 'bus', 'rail', 'other'] as const) {
      const response = renderShareImage({ kind: 'place', label: 'Przystanek', title: 'Zażółć gęślą jaźń '.repeat(4).slice(0, 80), detail: null, mode, city: 'Warszawa' })
      expect(await pngHead(response)).toEqual(PNG_MAGIC)
    }
  })
})
