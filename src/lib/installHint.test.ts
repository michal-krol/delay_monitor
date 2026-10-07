import { describe, expect, it } from 'vitest'
import { INSTALL_DISMISSED_KEY, isIos, readInstallDismissed, writeInstallDismissed } from './installHint'

function fakeStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[INSTALL_DISMISSED_KEY, initial]])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('install hint storage', () => {
  it('is not dismissed when nothing is stored', () => {
    expect(readInstallDismissed(fakeStorage())).toBe(false)
  })
  it('round-trips a dismissal', () => {
    const s = fakeStorage()
    writeInstallDismissed(s, 1_700_000_000_000)
    expect(readInstallDismissed(s)).toBe(true)
  })
  it.each(['not json', '"x"', '{}', '{"dismissedAt":"yesterday"}', 'null', '{"dismissedAt":-1}'])(
    'treats malformed value %s as not dismissed (schema at the boundary)',
    (raw) => {
      expect(readInstallDismissed(fakeStorage(raw))).toBe(false)
    }
  )
  it('does not throw when storage throws', () => {
    const boom = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(readInstallDismissed(boom)).toBe(false)
    expect(() => writeInstallDismissed(boom, 1)).not.toThrow()
  })
})

describe('isIos', () => {
  it('detects iPhone', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
  })
  it('detects iPadOS posing as a Mac by touch support', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
  })
  it('does not flag a desktop Mac or Android', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 'Linux armv8l', 5)).toBe(false)
  })
})
