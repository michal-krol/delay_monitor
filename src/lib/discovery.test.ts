import { describe, expect, it } from 'vitest'
import type { LineListEntry } from '@/lib/gtfs/query'
import { discoveryHref, discoveryKey, MAX_PER_GROUP, rankLines, type DiscoveryResult } from './discovery'

function line(
  number: string,
  mode: LineListEntry['mode'] = 'bus',
  longName = '',
  routeId = number,
  kind: LineListEntry['kind'] = 'regular',
): LineListEntry {
  return { routeId, line: number, longName, mode, kind }
}

const numbers = (lines: LineListEntry[]) => lines.map((l) => l.line)

it('links and keys a train by the concrete run, rejecting hostile identifiers', () => {
  const train = { scheduleId: '10', orderId: '20', operatingDate: '2026-10-21', name: null, nationalNumber: '123', origin: null, destination: null }
  expect(discoveryHref({ kind: 'train', train })).toBe('/connection/10/20/2026-10-21')
  expect(discoveryKey({ kind: 'train', train })).not.toBe(discoveryKey({ kind: 'train', train: { ...train, operatingDate: '2026-10-22' } }))
  expect(discoveryHref({ kind: 'train', train: { ...train, orderId: '../bad' } })).toBeNull()
  expect(discoveryHref({ kind: 'train', train: { ...train, operatingDate: '2026-10-21/other' } })).toBeNull()
})

describe('rankLines', () => {
  it('exact number before prefix: 20 before 200/N20', () => {
    const lines = [line('200'), line('N20', 'bus', 'Aleja 20'), line('20', 'tram'), line('201')]
    expect(numbers(rankLines(lines, '20'))).toEqual(['20', '200', '201', 'N20'])
  })

  it('polish diacritics and case fold in longName match', () => {
    const lines = [line('100', 'bus', 'Żerań Wschodni - Łazienki'), line('101', 'bus', 'Centrum')]
    expect(numbers(rankLines(lines, 'ŁAZIENKI'))).toEqual(['100'])
    expect(numbers(rankLines(lines, 'zeran'))).toEqual(['100'])
    expect(numbers(rankLines(lines, '  lazienki '))).toEqual(['100'])
  })

  it('one char finds a line', () => {
    const lines = [line('1', 'tram'), line('10', 'tram'), line('N16'), line('Z1')]
    expect(numbers(rankLines(lines, '1'))).toEqual(['1', '10'])
    expect(numbers(rankLines(lines, 'z'))).toEqual(['Z1'])
  })

  it('limit 8 by default and custom limit', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`1${String(i).padStart(2, '0')}`))
    expect(MAX_PER_GROUP).toBe(8)
    expect(rankLines(lines, '1')).toHaveLength(8)
    expect(numbers(rankLines(lines, '1', 3))).toEqual(['100', '101', '102'])
  })

  it('mode-agnostic: bus 128/N16, tram 20, metro M1/M2, rail S2 rank by number only', () => {
    const lines = [
      line('128', 'bus'),
      line('N16', 'bus', '', 'N16', 'night'),
      line('521', 'bus'),
      line('L-1', 'bus', '', 'L-1', 'local'),
      line('Z1', 'bus', '', 'Z1', 'replacement'),
      line('20', 'tram'),
      line('M1', 'metro'),
      line('M2', 'metro'),
      line('S2', 'rail'),
    ]
    expect(numbers(rankLines(lines, '2'))).toEqual(['20'])
    expect(numbers(rankLines(lines, 'm'))).toEqual(['M1', 'M2'])
    expect(numbers(rankLines(lines, 's2'))).toEqual(['S2'])
    expect(numbers(rankLines(lines, 'n16'))).toEqual(['N16'])
    expect(numbers(rankLines(lines, '1'))).toEqual(['128'])
  })

  it('empty query returns nothing', () => {
    const lines = [line('20', 'tram')]
    expect(rankLines(lines, '')).toEqual([])
    expect(rankLines(lines, '   ')).toEqual([])
  })
})

describe('discoveryHref', () => {
  const rail: DiscoveryResult = { kind: 'rail', station: { id: '5100065', name: 'Warszawa Śródmieście' } }

  it('href rail', () => {
    expect(discoveryHref(rail)).toBe(`/station/5100065?name=${encodeURIComponent('Warszawa Śródmieście')}`)
  })

  it("href stop encodes ':' as '-' and the name", () => {
    const stop: DiscoveryResult = { kind: 'stop', city: 'warszawa', stop: { id: '7014M:P1', name: 'Centrum 02' } }
    expect(discoveryHref(stop)).toBe('/city/warszawa/stop/7014M-P1?name=Centrum%2002')
    const plain: DiscoveryResult = { kind: 'stop', city: 'krakow', stop: { id: '100101', name: 'Rynek & Co' } }
    expect(discoveryHref(plain)).toBe('/city/krakow/stop/100101?name=Rynek%20%26%20Co')
  })

  it('href line encodes routeId (L-1, S2) under /city/{city}/line/', () => {
    expect(discoveryHref({ kind: 'line', city: 'warszawa', line: line('L-1', 'bus', '', 'L-1', 'local') })).toBe(
      '/city/warszawa/line/L-1',
    )
    expect(discoveryHref({ kind: 'line', city: 'warszawa', line: line('S2', 'rail') })).toBe('/city/warszawa/line/S2')
    expect(discoveryHref({ kind: 'line', city: 'warszawa', line: line('x', 'bus', '', 'A:b') })).toBe(
      '/city/warszawa/line/A%3Ab',
    )
  })

  it('href rejects bad city or id by returning null', () => {
    expect(discoveryHref({ kind: 'rail', station: { id: '51/../x', name: 'X' } })).toBeNull()
    expect(discoveryHref({ kind: 'rail', station: { id: '', name: 'X' } })).toBeNull()
    expect(discoveryHref({ kind: 'stop', city: 'War/szawa', stop: { id: '100101', name: 'X' } })).toBeNull()
    expect(discoveryHref({ kind: 'stop', city: 'warszawa', stop: { id: '../etc', name: 'X' } })).toBeNull()
    expect(discoveryHref({ kind: 'line', city: 'WARSZAWA', line: line('20', 'tram') })).toBeNull()
    expect(discoveryHref({ kind: 'line', city: 'warszawa', line: line('20', 'tram', '', '../20') })).toBeNull()
    expect(discoveryHref({ kind: 'line', city: 'warszawa', line: line('20', 'tram', '', '') })).toBeNull()
  })
})

describe('discoveryKey', () => {
  it('same id for rail and stop gives different keys', () => {
    const rail: DiscoveryResult = { kind: 'rail', station: { id: '100101', name: 'A' } }
    const stop: DiscoveryResult = { kind: 'stop', city: 'warszawa', stop: { id: '100101', name: 'A' } }
    const lineResult: DiscoveryResult = { kind: 'line', city: 'warszawa', line: line('20', 'tram') }
    expect(discoveryKey(rail)).toBe('rail:100101')
    expect(discoveryKey(stop)).toBe('stop:warszawa:100101')
    expect(discoveryKey(lineResult)).toBe('line:warszawa:20')
    expect(discoveryKey(rail)).not.toBe(discoveryKey(stop))
  })
})
