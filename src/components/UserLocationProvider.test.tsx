// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserLocationProvider, useUserLocation } from './UserLocationProvider'

type Success = (p: GeolocationPosition) => void
type Failure = (e: GeolocationPositionError) => void

const wrapper = ({ children }: { children: ReactNode }) => <UserLocationProvider>{children}</UserLocationProvider>

function position(lat: number, lon: number, accuracy: number) {
  return { coords: { latitude: lat, longitude: lon, accuracy } } as GeolocationPosition
}

function failure(code: number) {
  return { code, message: 'x' } as GeolocationPositionError
}

/** Atrapa `navigator.geolocation`: wywołania zbieramy, a odpowiedź przychodzi dopiero z testu. */
function stubGeolocation() {
  const calls: { ok: Success; fail: Failure; options: PositionOptions | undefined }[] = []
  const getCurrentPosition = vi.fn((ok: Success, fail: Failure, options?: PositionOptions) => {
    calls.push({ ok, fail, options })
  })
  const watchPosition = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition, watchPosition },
    configurable: true,
  })
  return { calls, getCurrentPosition, watchPosition }
}

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UserLocationProvider', () => {
  it('does not call geolocation on mount', () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(geo.watchPosition).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
    expect(result.current.point).toBeNull()
  })

  it('one getCurrentPosition call for concurrent request()', async () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    let first!: Promise<unknown>
    let second!: Promise<unknown>
    act(() => {
      first = result.current.request()
      second = result.current.request()
    })
    expect(result.current.status).toBe('requesting')
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    await act(async () => geo.calls[0].ok(position(52.2, 21, 35)))
    const point = { lat: 52.2, lon: 21, accuracyM: 35 }
    await expect(first).resolves.toEqual(point)
    await expect(second).resolves.toEqual(point)
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('ready keeps point and later request() reuses it', async () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    await act(async () => {
      const p = result.current.request()
      geo.calls[0].ok(position(52.2, 21, 35))
      await p
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.point).toEqual({ lat: 52.2, lon: 21, accuracyM: 35 })
    let again: unknown
    await act(async () => {
      again = await result.current.request()
    })
    expect(again).toEqual({ lat: 52.2, lon: 21, accuracyM: 35 })
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('denied sets status and does not re-prompt', async () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    let first: unknown = 'unset'
    await act(async () => {
      const p = result.current.request()
      geo.calls[0].fail(failure(1))
      first = await p
    })
    expect(first).toBeNull()
    expect(result.current.status).toBe('denied')
    expect(result.current.point).toBeNull()
    let second: unknown = 'unset'
    await act(async () => {
      second = await result.current.request()
    })
    expect(second).toBeNull()
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('denied')
  })

  it('timeout sets error and request() retries', async () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    await act(async () => {
      const p = result.current.request()
      geo.calls[0].fail(failure(3))
      await p
    })
    expect(result.current.status).toBe('error')
    expect(result.current.point).toBeNull()
    await act(async () => {
      const p = result.current.request()
      geo.calls[1].ok(position(50, 19, 80))
      await p
    })
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.point).toEqual({ lat: 50, lon: 19, accuracyM: 80 })
  })

  it('missing navigator.geolocation is unavailable', async () => {
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    expect(result.current.status).toBe('idle')
    let value: unknown = 'unset'
    await act(async () => {
      value = await result.current.request()
    })
    expect(value).toBeNull()
    expect(result.current.status).toBe('unavailable')
  })

  it('passes enableHighAccuracy false, timeout 10000, maximumAge 60000', () => {
    const geo = stubGeolocation()
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    act(() => {
      void result.current.request()
    })
    expect(geo.calls[0].options).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  })

  it('never writes to localStorage or the URL', async () => {
    const geo = stubGeolocation()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    const before = window.location.href
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    await act(async () => {
      const p = result.current.request()
      geo.calls[0].ok(position(52.2, 21, 35))
      await p
    })
    expect(setItem).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(window.location.href).toBe(before)
  })
})
