// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recentPlaceHref, recentPlaceKey, useRecentPlaces, type RecentPlace } from './useRecentPlaces'

const STORAGE_KEY = 'monitor.recentPlaces.v1'

const pkp = (id: string, name = `Stacja ${id}`): RecentPlace => ({ kind: 'pkp', id, name })
const group: RecentPlace = { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' }
const member: RecentPlace = { kind: 'gtfs', city: 'warszawa', id: '1001', member: '100102', name: 'Centrum 02' }

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('useRecentPlaces', () => {
  it('records newest first and dedups by key', () => {
    const { result } = renderHook(() => useRecentPlaces())
    act(() => result.current.record(pkp('1')))
    act(() => result.current.record(pkp('2')))
    act(() => result.current.record(pkp('1')))
    expect(result.current.places.map(recentPlaceKey)).toEqual(['pkp:1', 'pkp:2'])
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toHaveLength(2)
  })

  it('keeps at most 8', () => {
    const { result } = renderHook(() => useRecentPlaces())
    for (let i = 1; i <= 10; i++) act(() => result.current.record(pkp(String(i))))
    expect(result.current.places).toHaveLength(8)
    expect(recentPlaceKey(result.current.places[0])).toBe('pkp:10')
  })

  it('group and member of the same zespół are separate entries', () => {
    const { result } = renderHook(() => useRecentPlaces())
    act(() => result.current.record(group))
    act(() => result.current.record(member))
    expect(result.current.places.map(recentPlaceKey)).toEqual(['gtfs:warszawa:1001:100102', 'gtfs:warszawa:1001'])
  })

  it('reads stored places after mount and flips loaded', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([pkp('5')]))
    const { result } = renderHook(() => useRecentPlaces())
    expect(result.current.loaded).toBe(true)
    expect(result.current.places).toEqual([pkp('5')])
  })

  it('drops invalid entries one by one', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        pkp('1'),
        { kind: 'pkp', id: 'abc', name: 'x' },
        { kind: 'gtfs', city: 'WAW!', id: '1001', name: 'x' },
        { kind: 'pkp', id: '1', name: 'x'.repeat(121) },
        'junk',
      ]),
    )
    const { result } = renderHook(() => useRecentPlaces())
    expect(result.current.places).toEqual([pkp('1')])
  })

  it.each([['{"a":1}'], ['{not json'], ['"str"']])('non-array or broken JSON (%s) → empty, no throw', (raw) => {
    window.localStorage.setItem(STORAGE_KEY, raw)
    const { result } = renderHook(() => useRecentPlaces())
    expect(result.current.places).toEqual([])
    expect(result.current.loaded).toBe(true)
  })

  it('clear empties state and storage', () => {
    const { result } = renderHook(() => useRecentPlaces())
    act(() => result.current.record(pkp('1')))
    act(() => result.current.clear())
    expect(result.current.places).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('storage that throws on setItem keeps in-memory list', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => useRecentPlaces())
    act(() => result.current.record(pkp('1')))
    expect(result.current.places.map(recentPlaceKey)).toEqual(['pkp:1'])
  })

  it('merges with places written by another instance (re-reads storage before writing)', () => {
    const { result } = renderHook(() => useRecentPlaces())
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([pkp('9')]))
    act(() => result.current.record(pkp('1')))
    expect(result.current.places.map(recentPlaceKey)).toEqual(['pkp:1', 'pkp:9'])
  })
})

describe('recentPlaceHref', () => {
  it('encodes the pkp name', () => {
    expect(recentPlaceHref(pkp('33605', 'Kraków Gł.'))).toBe('/station/33605?name=Krak%C3%B3w%20G%C5%82.')
  })

  it('links a zespół and a single przystanek', () => {
    expect(recentPlaceHref(group)).toBe('/city/warszawa/stop/1001')
    expect(recentPlaceHref(member)).toBe('/city/warszawa/stop/1001?przystanek=100102')
  })

  it('swaps the metro platform colon for a path-safe dash', () => {
    expect(recentPlaceHref({ kind: 'gtfs', city: 'warszawa', id: '7014M:P1', name: 'Świętokrzyska' })).toBe('/city/warszawa/stop/7014M-P1')
  })
})
