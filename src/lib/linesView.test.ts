import { describe, expect, it } from 'vitest'
import { filterCatalogLines, groupByMode, linesViewPatch, parseLinesView } from './linesView'
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
  it.each(['bus', 'tram', 'metro', 'rail'])('ignores the retired mode filter %s', (mode) => {
    const view = parseLinesView(new URLSearchParams(`mode=${mode}`))
    expect(filterCatalogLines(LINES, view)).toEqual(LINES)
  })
  it('parses q and ignores retired mode', () => {
    expect(parseLinesView(new URLSearchParams('q=20&mode=tram'))).toEqual({ q: '20' })
    expect(parseLinesView(new URLSearchParams(''))).toEqual({ q: '' })
  })

  it('ignores an invalid mode', () => {
    expect(parseLinesView(new URLSearchParams('mode=submarine'))).toEqual({ q: '' })
    expect(parseLinesView(new URLSearchParams('mode='))).toEqual({ q: '' })
  })

  it('truncates q to 100', () => {
    expect(parseLinesView(new URLSearchParams(`q=${'a'.repeat(150)}`)).q).toHaveLength(100)
  })
})

describe('linesViewPatch', () => {
  it('patch clears empty q and null mode', () => {
    expect(linesViewPatch({ q: '' })).toEqual({ q: null, mode: null })
    expect(linesViewPatch({ q: '20' })).toEqual({ q: '20', mode: null })
  })
})

describe('filterCatalogLines', () => {
  it('exact number ranks before prefix and name match', () => {
    const numbers = filterCatalogLines(LINES, { q: '20' }).map((l) => l.routeId)
    // 20 (exact) → 200 (prefix) → 128 (nazwa „20 Lipca"); M1 i reszta odpadają
    expect(numbers).toEqual(['20', '200', '128'])
  })

  it('returns every match, not only the first eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`1${i}`, 'bus'))
    expect(filterCatalogLines(many, { q: '1' })).toHaveLength(12)
  })


  it('whitespace-only q is no query', () => {
    expect(filterCatalogLines(LINES, { q: '   ' })).toEqual(LINES)
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
