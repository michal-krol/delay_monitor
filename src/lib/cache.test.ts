import { describe, expect, it } from 'vitest'
import { createTtlCache } from './cache'

function withClock() {
  let current = 0
  return {
    now: () => current,
    advance(ms: number) {
      current += ms
    },
  }
}

describe('createTtlCache', () => {
  it('returns what was stored', () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 })
    cache.set('a', 'wartość')
    expect(cache.get('a')).toBe('wartość')
  })

  it('returns undefined for an unknown key', () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 })
    expect(cache.get('brak')).toBeUndefined()
  })

  it('expires an entry once its ttl has passed', () => {
    const clock = withClock()
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10, now: clock.now })

    cache.set('a', 'wartość')
    clock.advance(999)
    expect(cache.get('a')).toBe('wartość')

    clock.advance(1)
    expect(cache.get('a')).toBeUndefined()
  })

  it('frees expired entries instead of holding them until someone asks', () => {
    const clock = withClock()
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 100, now: clock.now })

    for (let i = 0; i < 50; i += 1) cache.set(`klucz-${i}`, 'x')
    expect(cache.size()).toBe(50)

    clock.advance(2000)
    cache.set('nowy', 'x')

    // Zwykła Map trzymałaby tu 51 wpisów, z czego 50 martwych.
    expect(cache.size()).toBe(1)
  })

  it('never grows past maxEntries', () => {
    const cache = createTtlCache<number>({ ttlMs: 60000, maxEntries: 3 })

    for (let i = 0; i < 100; i += 1) cache.set(`klucz-${i}`, i)

    expect(cache.size()).toBe(3)
  })

  it('evicts the oldest entry first', () => {
    const cache = createTtlCache<number>({ ttlMs: 60000, maxEntries: 2 })

    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('treats overwriting a key as a refresh, not as growth', () => {
    const cache = createTtlCache<number>({ ttlMs: 60000, maxEntries: 2 })

    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 11)

    expect(cache.size()).toBe(2)
    expect(cache.get('a')).toBe(11)

    // 'a' zostało odświeżone, więc teraz to 'b' jest najstarsze.
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(11)
  })
})
