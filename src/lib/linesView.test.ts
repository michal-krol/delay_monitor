import { describe, expect, it } from 'vitest'
import { availableModes, filterCatalogLines, groupByMode, linesViewPatch, parseLinesView } from './linesView'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'

const entry = (routeId: string, mode: GtfsMode, longName = ''): LineListEntry => ({ routeId, line: routeId, longName, mode, kind: 'regular' })

const LINES = [
  entry('M1', 'metro', 'Kabaty – Młociny'),
  entry('2', 'tram', 'Wilanów – Żerań'),
  entry('20', 'tram', 'Piaski'),
  entry('200', 'bus', 'Dworzec – Bemowo'),
  entry('128', 'bus', 'Dworzec Centralny – 20 Lipca'),
  entry('S1', 'rail', 'Pruszków – Otwock'),
]

describe('parseLinesView', () => {
  it('parses q and mode', () => {
    expect(parseLinesView(new URLSearchParams('q=20&mode=tram'))).toEqual({ q: '20', mode: 'tram' })
    expect(parseLinesView(new URLSearchParams(''))).toEqual({ q: '', mode: null })
  })

  it('ignores an invalid mode', () => {
    expect(parseLinesView(new URLSearchParams('mode=submarine')).mode).toBeNull()
    expect(parseLinesView(new URLSearchParams('mode=')).mode).toBeNull()
  })

  it('truncates q to 100', () => {
    expect(parseLinesView(new URLSearchParams(`q=${'a'.repeat(150)}`)).q).toHaveLength(100)
  })
})

describe('linesViewPatch', () => {
  it('patch clears empty q and null mode', () => {
    expect(linesViewPatch({ q: '', mode: null })).toEqual({ q: null, mode: null })
    expect(linesViewPatch({ q: '20', mode: 'bus' })).toEqual({ q: '20', mode: 'bus' })
  })
})

describe('filterCatalogLines', () => {
  it('exact number ranks before prefix and name match', () => {
    const numbers = filterCatalogLines(LINES, { q: '20', mode: null }).map((l) => l.routeId)
    // 20 (exact) → 200 (prefix) → 128 (nazwa „20 Lipca"); M1 i reszta odpadają
    expect(numbers).toEqual(['20', '200', '128'])
  })

  it('returns every match, not only the first eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`1${i}`, 'bus'))
    expect(filterCatalogLines(many, { q: '1', mode: null })).toHaveLength(12)
  })

  it.each(['bus', 'tram', 'metro', 'rail'] as const)('mode filter keeps only that mode (%s)', (mode) => {
    const kept = filterCatalogLines(LINES, { q: '', mode })
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.every((l) => l.mode === mode)).toBe(true)
  })

  it('mode filter composes with q', () => {
    expect(filterCatalogLines(LINES, { q: '20', mode: 'tram' }).map((l) => l.routeId)).toEqual(['20'])
  })

  it('whitespace-only q is no query', () => {
    expect(filterCatalogLines(LINES, { q: '   ', mode: null })).toEqual(LINES)
  })
})

describe('groupByMode', () => {
  it('groupByMode has all five keys', () => {
    const grouped = groupByMode(LINES.filter((l) => l.mode === 'tram'))
    expect(Object.keys(grouped).sort()).toEqual(['bus', 'metro', 'other', 'rail', 'tram'])
    expect(grouped.tram.map((l) => l.routeId)).toEqual(['2', '20'])
    expect(grouped.bus).toEqual([])
  })
})

describe('availableModes', () => {
  it('availableModes skips empty modes', () => {
    expect(availableModes(LINES)).toEqual(['metro', 'tram', 'bus', 'rail'])
    expect(availableModes([])).toEqual([])
  })
})
