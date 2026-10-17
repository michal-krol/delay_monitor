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

  it('a point older than 60 s is queried again; a fresh one is reused (maximumAge is not moot)', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    try {
      const geo = stubGeolocation()
      const { result } = renderHook(() => useUserLocation(), { wrapper })
      await act(async () => {
        const p = result.current.request()
        geo.calls[0].ok(position(52.2, 21, 35))
        await p
      })
      await act(async () => {
        vi.advanceTimersByTime(59_000)
        await result.current.request()
      })
      expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
      let second: unknown
      await act(async () => {
        vi.advanceTimersByTime(2_000)
        const p = result.current.request()
        geo.calls[1].ok(position(52.3, 21.1, 20))
        second = await p
      })
      expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2)
      expect(second).toEqual({ lat: 52.3, lon: 21.1, accuracyM: 20 })
      expect(result.current.point).toEqual({ lat: 52.3, lon: 21.1, accuracyM: 20 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed re-query drops the stale point instead of showing it as current', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    try {
      const geo = stubGeolocation()
      const { result } = renderHook(() => useUserLocation(), { wrapper })
      await act(async () => {
        const p = result.current.request()
        geo.calls[0].ok(position(52.2, 21, 35))
        await p
      })
      await act(async () => {
        vi.advanceTimersByTime(61_000)
        const p = result.current.request()
        geo.calls[1].fail(failure(3))
        expect(await p).toBeNull()
      })
      expect(result.current.status).toBe('error')
      expect(result.current.point).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a prompt dismissed without a choice ends in error after the watchdog, so a retry is possible', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    try {
      const geo = stubGeolocation()
      const { result } = renderHook(() => useUserLocation(), { wrapper })
      let pending!: Promise<unknown>
      act(() => {
        pending = result.current.request()
      })
      expect(result.current.status).toBe('requesting')
      await act(async () => {
        vi.advanceTimersByTime(14_000)
      })
      expect(result.current.status).toBe('requesting')
      await act(async () => {
        vi.advanceTimersByTime(2_000)
      })
      await expect(pending).resolves.toBeNull()
      expect(result.current.status).toBe('error')
      // Późna odpowiedź po watchdogu nie zmienia stanu; ponowienie pyta przeglądarkę jeszcze raz.
      await act(async () => geo.calls[0].ok(position(52.2, 21, 35)))
      expect(result.current.status).toBe('error')
      await act(async () => {
        const p = result.current.request()
        geo.calls[1].ok(position(50, 19, 80))
        await p
      })
      expect(geo.getCurrentPosition).toHaveBeenCalledTimes(2)
      expect(result.current.status).toBe('ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a synchronous throw from getCurrentPosition becomes error, not an unhandled rejection', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: () => {
          throw new Error('SecurityError')
        },
      },
      configurable: true,
    })
    const { result } = renderHook(() => useUserLocation(), { wrapper })
    let value: unknown = 'unset'
    await act(async () => {
      value = await result.current.request()
    })
    expect(value).toBeNull()
    expect(result.current.status).toBe('error')
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
