// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMapCamera } from './useMapCamera'

type Point = { lat: number; lon: number }
const loc = vi.hoisted(() => ({
  value: { status: 'idle', point: null, fixAt: null, request: async () => null } as {
    status: string
    point: Point | null
    fixAt: number | null
    request: () => Promise<Point | null>
  },
}))
vi.mock('@/hooks/useUserLocation', () => ({ useUserLocation: () => loc.value }))

const USER = { lat: 52.2301, lon: 21.0101 }
const FAR = { center: { lat: 52.4, lon: 21.3 }, zoom: 16 }
const NEAR = { center: { lat: USER.lat + 0.0003, lon: USER.lon }, zoom: 16 }
const MAP_CENTER = { lat: 52.23, lon: 21.01 }

const mount = (city = 'warszawa') =>
  renderHook(({ c }) => useMapCamera({ city: c, mapCenter: MAP_CENTER, clearSelection: vi.fn() }), { initialProps: { c: city } })
const stored = () => window.localStorage.getItem('monitor.map.view.v1')

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/city/warszawa/map')
  loc.value = { status: 'idle', point: null, fixAt: null, request: async () => null }
})
afterEach(() => vi.restoreAllMocks())

describe('useMapCamera: start camera', () => {
  it('prefers ?at over the last saved view over the city centre', () => {
    window.localStorage.setItem('monitor.map.view.v1', JSON.stringify({ city: 'warszawa', at: '52.10000,21.00000,13.0' }))
    window.history.replaceState(null, '', '/city/warszawa/map?at=52.3,21.1,14')
    expect(mount().result.current.initialCamera).toEqual({ lat: 52.3, lon: 21.1, zoom: 14 })
  })

  it('falls back to the last view of THIS city, then to the city centre', () => {
    window.localStorage.setItem('monitor.map.view.v1', JSON.stringify({ city: 'krakow', at: '50.06,19.94,13.0' }))
    expect(mount().result.current.initialCamera).toMatchObject(MAP_CENTER)
    window.localStorage.setItem('monitor.map.view.v1', JSON.stringify({ city: 'warszawa', at: '52.1,21.0,13.0' }))
    expect(mount().result.current.initialCamera).toEqual({ lat: 52.1, lon: 21.0, zoom: 13 })
  })

  it('ignores a corrupt stored view', () => {
    window.localStorage.setItem('monitor.map.view.v1', '{nope')
    expect(mount().result.current.initialCamera).toMatchObject(MAP_CENTER)
  })
})

describe('useMapCamera: privacy rule (adr/0012)', () => {
  it('persists a far view to ?at and localStorage', () => {
    const { result } = mount()
    act(() => result.current.recordView(FAR))
    expect(window.location.search).toContain('at=')
    expect(stored()).toContain('"city":"warszawa"')
  })

  it('writes nothing while the latch set by "my location" is up, even far from the user', () => {
    const { result } = mount()
    act(() => result.current.showNearbyAt(USER))
    act(() => result.current.recordView(FAR))
    expect(window.location.search).not.toContain('at=')
    expect(stored()).toBeNull()
  })

  it('showNearbyAt strips a ?at= that may have contained the position', () => {
    window.history.replaceState(null, '', '/city/warszawa/map?at=52.2301,21.0101,16')
    const { result } = mount()
    act(() => result.current.showNearbyAt(USER))
    expect(window.location.search).not.toContain('at=')
  })

  it('the latch is lifted only by a drag (liftViewBlock), never by recording a view', () => {
    const { result } = mount()
    act(() => result.current.showNearbyAt(USER))
    act(() => result.current.recordView(FAR))
    act(() => result.current.recordView(FAR))
    expect(stored()).toBeNull()
    act(() => result.current.liftViewBlock())
    act(() => result.current.recordView(FAR))
    expect(stored()).not.toBeNull()
  })

  it('the radius stays after the latch is gone: a view on the user is still not persisted', () => {
    const { result } = mount()
    act(() => result.current.showNearbyAt(USER))
    act(() => result.current.liftViewBlock())
    act(() => result.current.recordView(NEAR))
    expect(stored()).toBeNull()
    expect(window.location.search).not.toContain('at=')
  })

  it('also honours the provider point (position obtained on another page)', () => {
    loc.value = { ...loc.value, point: USER }
    const { result } = mount()
    act(() => result.current.recordView(NEAR))
    expect(stored()).toBeNull()
    act(() => result.current.recordView(FAR))
    expect(stored()).not.toBeNull()
  })

  it('a deliberate focus lifts the latch, a focus from a GPS "nearby" (keepBlock) keeps it', () => {
    const { result } = mount()
    act(() => result.current.showNearbyAt(USER))
    act(() => result.current.focusOn(52.4, 21.3, true))
    act(() => result.current.recordView(FAR))
    expect(stored()).toBeNull()
    act(() => result.current.focusOn(52.4, 21.3))
    act(() => result.current.recordView(FAR))
    expect(stored()).not.toBeNull()
  })

  it('a GPS answer that arrives after the city changed touches neither URL nor state', async () => {
    let resolve!: (p: Point) => void
    loc.value = { ...loc.value, request: () => new Promise<Point | null>((r) => (resolve = r)) }
    window.history.replaceState(null, '', '/city/warszawa/map?at=52.3,21.1,14')
    const { result, rerender } = mount()
    let pending!: Promise<void>
    act(() => {
      pending = result.current.showMyLocation()
    })
    rerender({ c: 'krakow' })
    await act(async () => {
      resolve(USER)
      await pending
    })
    expect(result.current.nearby).toBeNull()
    expect(window.location.search).toContain('at=52.3,21.1,14')
  })
})

describe('useMapCamera: ?nearby=1', () => {
  it('without a fresh point waits for a click: pending, no GPS call', () => {
    const request = vi.fn(async () => null)
    loc.value = { ...loc.value, request }
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    const { result } = mount()
    expect(result.current.nearbyPending).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it('with a fresh point opens the area, consumes the flag and starts on the point', () => {
    loc.value = { ...loc.value, point: USER, fixAt: Date.now() }
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    const { result } = mount()
    expect(result.current.nearby).toEqual(USER)
    expect(result.current.nearbyFromGps).toBe(true)
    expect(window.location.search).not.toContain('nearby')
    expect(result.current.initialCamera).toMatchObject(USER)
  })

  it('a denied location consumes the pending flag', () => {
    window.history.replaceState(null, '', '/city/warszawa/map?nearby=1')
    const { result, rerender } = mount()
    loc.value = { ...loc.value, status: 'denied' }
    rerender({ c: 'warszawa' })
    expect(result.current.nearbyPending).toBe(false)
    expect(window.location.search).not.toContain('nearby')
  })
})
