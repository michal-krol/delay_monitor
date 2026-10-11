// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LineListEntry } from '@/lib/gtfs/query'
import { jsonResponse } from '@/test-utils/http'
import { useCityLines, type CityLinesState } from './useCityLines'
import { useUnifiedSearch } from './useUnifiedSearch'

vi.mock('./useCityLines', () => ({ useCityLines: vi.fn() }))

const entry = (routeId: string, mode: LineListEntry['mode'] = 'bus'): LineListEntry => ({
  routeId,
  line: routeId,
  longName: `Trasa ${routeId}`,
  mode,
  kind: 'regular',
})
const lineState = (lines: LineListEntry[] | null, state: CityLinesState['state'] = 'ready', refresh = vi.fn()): CityLinesState => ({
  lines,
  state,
  error: state === 'failed',
  refresh,
  schedule: null,
  attribution: [],
})

const rail = (id: string, name: string) => ({ id, name, kind: 'rail', mode: 'rail' })
const stop = (id: string, name: string) => ({ id, name, kind: 'transit', mode: 'bus', modes: ['bus'], lines: [{ routeId: '128', line: '128', mode: 'bus', kind: 'regular' }] })
const SOURCES_OK = { rail: 'ready', transit: 'ready' }
const places = (stations: unknown[], sources: unknown = SOURCES_OK, extra: object = {}) => jsonResponse({ stations, sources, ...extra })

let fetchMock: ReturnType<typeof vi.fn>
const mockUseCityLines = vi.mocked(useCityLines)

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
const urls = () => fetchMock.mock.calls.map((call) => String(call[0]))

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn(() => places([]))
  vi.stubGlobal('fetch', fetchMock)
  mockUseCityLines.mockReset()
  mockUseCityLines.mockReturnValue(lineState([entry('128'), entry('20', 'tram'), entry('N20')]))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useUnifiedSearch', () => {
  it('<3 chars: no places request, lines still found locally from 1 char', async () => {
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: '12' }))
    await advance(2000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.sources).toEqual({ rail: 'idle', transit: 'idle', lines: 'ready' })
    expect(result.current.results.map((r) => r.kind)).toEqual(['line'])
    expect(result.current.results[0]).toMatchObject({ kind: 'line', city: 'warszawa', line: { routeId: '128' } })
  })

  it('3 chars: debounce 300 ms then exactly one request', async () => {
    fetchMock.mockImplementation(() => places([rail('33605', 'Warszawa Centralna')]))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: ' war ' }))
    await advance(299)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.sources.rail).toBe('loading')
    await advance(1)
    expect(urls()).toEqual(['/api/search?q=war&city=warszawa&rail=all'])
    await advance(2000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.sources).toMatchObject({ rail: 'ready', transit: 'ready' })
    expect(result.current.results).toEqual([{ kind: 'rail', station: rail('33605', 'Warszawa Centralna') }])
  })

  it('late response for the old query is ignored', async () => {
    let resolveA!: (r: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveA = resolve)))
    fetchMock.mockImplementationOnce(() => places([rail('2', 'Bielany')]))
    const { result, rerender } = renderHook((p: { query: string }) => useUnifiedSearch({ city: 'warszawa', query: p.query }), {
      initialProps: { query: 'abc' },
    })
    await advance(300)
    rerender({ query: 'abcd' })
    await advance(300)
    await act(async () => {
      resolveA(new Response(JSON.stringify({ stations: [rail('1', 'Stara')], sources: SOURCES_OK })))
    })
    expect(result.current.results).toEqual([{ kind: 'rail', station: rail('2', 'Bielany') }])
  })

  it('city change drops the other city\'s results', async () => {
    fetchMock.mockImplementationOnce(() => places([stop('100101', 'Centrum 01')]))
    const { result, rerender } = renderHook((p: { city: string }) => useUnifiedSearch({ city: p.city, query: 'cen' }), {
      initialProps: { city: 'warszawa' },
    })
    await advance(300)
    expect(result.current.results.some((r) => r.kind === 'stop')).toBe(true)
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}))
    rerender({ city: 'krakow' })
    expect(result.current.results.some((r) => r.kind === 'stop')).toBe(false)
    expect(result.current.sources.transit).toBe('loading')
    await advance(300)
    expect(urls()[1]).toBe('/api/search?q=cen&city=krakow&rail=all')
    expect(result.current.results.some((r) => r.kind === 'stop')).toBe(false)
  })

  it('lineSource given → no extra /api/gtfs/lines fetch', async () => {
    const lineSource = lineState([entry('128')])
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: '12', lineSource }))
    await advance(2000)
    expect(mockUseCityLines).toHaveBeenCalledWith(null)
    expect(mockUseCityLines).not.toHaveBeenCalledWith('warszawa')
    expect(urls().some((url) => url.includes('/api/gtfs/lines'))).toBe(false)
    expect(result.current.results).toHaveLength(1)
  })

  it('rail failed + lines ready → lines still returned, rail failed', async () => {
    fetchMock.mockImplementation(() => places([stop('100101', '128 Centrum')], { rail: 'failed', transit: 'ready' }))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: '128' }))
    await advance(300)
    expect(result.current.sources).toEqual({ rail: 'failed', transit: 'ready', lines: 'ready' })
    expect(result.current.results.map((r) => r.kind)).toEqual(['stop', 'line'])
  })

  it('places request failing never yields results from an older query', async () => {
    fetchMock.mockImplementationOnce(() => places([rail('1', 'Warszawa Zachodnia')]))
    const { result, rerender } = renderHook((p: { query: string }) => useUnifiedSearch({ city: 'warszawa', query: p.query }), {
      initialProps: { query: 'war' },
    })
    await advance(300)
    expect(result.current.results.some((r) => r.kind === 'rail')).toBe(true)
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('network down')))
    rerender({ query: 'warsz' })
    expect(result.current.results.some((r) => r.kind === 'rail')).toBe(false)
    await advance(300)
    expect(result.current.sources).toMatchObject({ rail: 'failed', transit: 'failed' })
    expect(result.current.results.some((r) => r.kind === 'rail')).toBe(false)
  })

  it('HTTP error and bad shape both mean failed', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 500 })))
    const { result, rerender } = renderHook((p: { query: string }) => useUnifiedSearch({ city: 'warszawa', query: p.query }), {
      initialProps: { query: 'abc' },
    })
    await advance(300)
    expect(result.current.sources).toMatchObject({ rail: 'failed', transit: 'failed' })
    fetchMock.mockImplementationOnce(() => jsonResponse({ stations: 'nope' }))
    rerender({ query: 'abcd' })
    await advance(300)
    expect(result.current.sources).toMatchObject({ rail: 'failed', transit: 'failed' })
  })

  it('transit loading retries after 1500 ms until ready', async () => {
    fetchMock
      .mockImplementationOnce(() => places([rail('1', 'Warszawa')], { rail: 'ready', transit: 'loading' }, { loading: true }))
      .mockImplementationOnce(() => places([rail('1', 'Warszawa'), stop('100101', 'Warszawa Ochota')]))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: 'war' }))
    await advance(300)
    expect(result.current.sources).toMatchObject({ rail: 'ready', transit: 'loading' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1499)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.sources.transit).toBe('ready')
    expect(result.current.results.map((r) => r.kind)).toEqual(['rail', 'stop'])
    await advance(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('city null → transit and lines disabled, rail works, no city param', async () => {
    mockUseCityLines.mockReturnValue(lineState(null, 'ready'))
    fetchMock.mockImplementation(() => places([rail('33605', 'Warszawa Centralna')], { rail: 'ready', transit: 'disabled' }))
    const { result } = renderHook(() => useUnifiedSearch({ city: null, query: 'war' }))
    expect(result.current.sources).toEqual({ rail: 'loading', transit: 'disabled', lines: 'disabled' })
    await advance(300)
    expect(urls()).toEqual(['/api/search?q=war&rail=all'])
    expect(result.current.sources).toEqual({ rail: 'ready', transit: 'disabled', lines: 'disabled' })
    expect(result.current.results).toEqual([{ kind: 'rail', station: rail('33605', 'Warszawa Centralna') }])
  })

  it('results capped at 8 per group and deduped', async () => {
    const many = Array.from({ length: 12 }, (_, i) => rail(String(100 + i), `Stacja ${i}`))
    fetchMock.mockImplementation(() => places([...many, rail('100', 'Stacja 0 duplikat'), stop('7014M', 'Metro'), stop('7014M', 'Metro bis')]))
    mockUseCityLines.mockReturnValue(lineState(Array.from({ length: 12 }, (_, i) => entry(`1${i}`))))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: '1' + 'ab' }))
    await advance(300)
    const kinds = result.current.results.map((r) => r.kind)
    expect(kinds.filter((k) => k === 'rail')).toHaveLength(8)
    expect(kinds.filter((k) => k === 'stop')).toHaveLength(1)
    expect(result.current.results.filter((r) => r.kind === 'rail').map((r) => r.kind === 'rail' && r.station.id)).toEqual(
      many.slice(0, 8).map((s) => s.id),
    )
    const order = ['rail', 'stop', 'line']
    expect(kinds.map((k) => order.indexOf(k))).toEqual([...kinds.map((k) => order.indexOf(k))].sort())
  })

  it('lines group is capped at 8 too', async () => {
    mockUseCityLines.mockReturnValue(lineState(Array.from({ length: 12 }, (_, i) => entry(`1${i}`))))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: '1' }))
    expect(result.current.results).toHaveLength(8)
  })

  it('invalid ids in the response are dropped', async () => {
    fetchMock.mockImplementation(() =>
      places([
        rail('33605', 'Warszawa Centralna'),
        rail('../etc', 'Zła stacja'),
        rail('abc', 'Litery'),
        stop('bad id!', 'Zły przystanek'),
        stop('100101', 'Dobry'),
        { id: 5, name: 'Liczba', kind: 'rail' },
        { id: '1', name: '', kind: 'rail' },
        { id: '1', name: 'x'.repeat(121), kind: 'rail' },
        { id: '1', name: 'Zły rodzaj', kind: 'metro' },
        null,
        'napis',
      ]),
    )
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: 'war' }))
    await advance(300)
    expect(result.current.results.map((r) => (r.kind === 'rail' ? r.station.name : r.kind === 'stop' ? r.stop.name : ''))).toEqual([
      'Warszawa Centralna',
      'Dobry',
    ])
  })

  it('transit results are dropped when city is null', async () => {
    fetchMock.mockImplementation(() => places([stop('100101', 'Obcy'), rail('1', 'Gdańsk')], { rail: 'ready', transit: 'ready' }))
    const { result } = renderHook(() => useUnifiedSearch({ city: null, query: 'gda' }))
    await advance(300)
    expect(result.current.results.map((r) => r.kind)).toEqual(['rail'])
    expect(result.current.sources.transit).toBe('disabled')
  })

  it('retry refetches a failed places request and refreshes failed lines', async () => {
    const refresh = vi.fn()
    mockUseCityLines.mockReturnValue(lineState(null, 'failed', refresh))
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('down')))
    fetchMock.mockImplementationOnce(() => places([rail('1', 'Warszawa')]))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: 'war' }))
    await advance(300)
    expect(result.current.sources).toEqual({ rail: 'failed', transit: 'failed', lines: 'failed' })
    const retry = result.current.retry
    act(() => retry())
    expect(result.current.sources.rail).toBe('loading')
    await advance(300)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result.current.sources.rail).toBe('ready')
    expect(result.current.retry).toBe(retry)
  })

  it('retry does not refetch healthy sources', async () => {
    const refresh = vi.fn()
    mockUseCityLines.mockReturnValue(lineState([entry('128')], 'ready', refresh))
    const { result } = renderHook(() => useUnifiedSearch({ city: 'warszawa', query: 'war' }))
    await advance(300)
    act(() => result.current.retry())
    await advance(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('lines states: empty query idle, loading, failed', () => {
    mockUseCityLines.mockReturnValue(lineState(null, 'loading'))
    const { result, rerender } = renderHook((p: { query: string }) => useUnifiedSearch({ city: 'warszawa', query: p.query }), {
      initialProps: { query: '' },
    })
    expect(result.current.sources.lines).toBe('idle')
    rerender({ query: '1' })
    expect(result.current.sources.lines).toBe('loading')
    mockUseCityLines.mockReturnValue(lineState(null, 'failed'))
    rerender({ query: '1' })
    expect(result.current.sources.lines).toBe('failed')
    expect(result.current.results).toEqual([])
  })
})
