import { describe, expect, it } from 'vitest'
import {
  CITY_ID_PATTERN,
  GTFS_STOP_ID_PATTERN,
  OPERATING_DATE_PATTERN,
  STATION_ID_PATTERN,
} from './validation'

describe('STATION_ID_PATTERN (PKP — zostaje ścisły)', () => {
  it('accepts 1–10 digit ids', () => {
    expect(STATION_ID_PATTERN.test('33605')).toBe(true)
    expect(STATION_ID_PATTERN.test('7')).toBe(true)
  })

  it('rejects anything non-numeric, including GTFS-shaped ids', () => {
    for (const bad of ['7014M', '100101:P1', '5100 ', 'abc', '', '12345678901']) {
      expect(STATION_ID_PATTERN.test(bad), bad).toBe(false)
    }
  })
})

describe('CITY_ID_PATTERN', () => {
  it('accepts lowercase-ascii city slugs', () => {
    for (const ok of ['warszawa', 'krakow', 'wroclaw', 'bydgoszcz', 'lodz']) {
      expect(CITY_ID_PATTERN.test(ok), ok).toBe(true)
    }
  })

  it('rejects uppercase, diacritics, digits, punctuation, and out-of-range lengths', () => {
    for (const bad of ['Warszawa', 'w', 'krakow1', 'wa-w', 'łódź', 'a'.repeat(25), '', 'wa/rk']) {
      expect(CITY_ID_PATTERN.test(bad), bad).toBe(false)
    }
  })
})

describe('GTFS_STOP_ID_PATTERN', () => {
  it('accepts real ZTM / metro shapes', () => {
    for (const ok of ['100101', '7014M', '7014M:P1', 'M1', '1001']) {
      expect(GTFS_STOP_ID_PATTERN.test(ok), ok).toBe(true)
    }
  })

  it('rejects traversal, separators, control chars, overlong and empty', () => {
    for (const bad of ['..', 'a,b', '1%0A', '1\n0', 'a'.repeat(200), '', '7014M:', ':P1', '7014M:P1:P2']) {
      expect(GTFS_STOP_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('OPERATING_DATE_PATTERN', () => {
  it('matches yyyy-MM-dd only', () => {
    expect(OPERATING_DATE_PATTERN.test('2026-09-02')).toBe(true)
    expect(OPERATING_DATE_PATTERN.test('2026-9-2')).toBe(false)
  })
})
