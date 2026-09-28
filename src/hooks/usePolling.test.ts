// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from './usePolling'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

function setHidden(value: boolean): void {
  Object.defineProperty(document, 'hidden', { value, configurable: true })
}

describe('usePolling', () => {
  it('steps through the retry ladder while isLoading returns true', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isLoading: (d: { ready: boolean }) => !d.ready }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(2) // ladder step 1

    await vi.advanceTimersByTimeAsync(2000)
    expect(fetcher).toHaveBeenCalledTimes(3) // ladder step 2

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetcher).toHaveBeenCalledTimes(4) // ladder step 3
  })

  it('never gives up: keeps retrying at refreshMs (or the last ladder step) once the ladder is exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isLoading: (d: { ready: boolean }) => !d.ready }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Burn through the whole ladder [1,2,3,5,8,15]s.
    for (const step of [1000, 2000, 3000, 5000, 8000, 15000]) {
      await vi.advanceTimersByTimeAsync(step)
    }
    expect(fetcher).toHaveBeenCalledTimes(7)

    // Ladder exhausted -> falls back to refreshMs, forever, not silence.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(8)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(9)
  })

  it('falls back to the last ladder step when refreshMs is null and the ladder is exhausted', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ready: false })
    renderHook(() => usePolling('k', fetcher, { refreshMs: null, isLoading: () => true }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    for (const step of [1000, 2000, 3000, 5000, 8000, 15000]) {
      await vi.advanceTimersByTimeAsync(step)
    }
    expect(fetcher).toHaveBeenCalledTimes(7)

    await vi.advanceTimersByTimeAsync(15_000) // last ladder step, repeated
    expect(fetcher).toHaveBeenCalledTimes(8)
  })

  it('keeps the last data after an error and retries at errorRetryMs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ value: 'first' })
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({ value: 'second' })
    const { result } = renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, errorRetryMs: 5_000 }))
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'first' }))

    await vi.advanceTimersByTimeAsync(30_000) // scheduled refresh -> fails
    await vi.waitFor(() => expect(result.current.error).toBe('network down'))
    expect(result.current.data).toEqual({ value: 'first' }) // kept, not cleared (#7)

    await vi.advanceTimersByTimeAsync(5_000) // errorRetryMs, not refreshMs
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'second' }))
    expect(result.current.error).toBeNull()
  })

  it('pauses without fetching while the tab is hidden, with no timer spinning underneath', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Stayed paused, not rescheduled to fire again on its own.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetches immediately when the tab becomes visible again after a paused tick', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000) // scheduled tick pauses
    expect(fetcher).toHaveBeenCalledTimes(1)

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('does nothing on visibilitychange when no tick was paused', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // Tab never went hidden -> nothing was paused; a visibilitychange event is a no-op.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('the first fetch after mount always runs even when the tab starts out hidden', async () => {
    setHidden(true)
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  })

  it('resets data and cancels old timers when the key changes', async () => {
    const fetcherA = vi.fn().mockResolvedValue({ value: 'a' })
    const fetcherB = vi.fn().mockResolvedValue({ value: 'b' })
    const { result, rerender } = renderHook(({ key, fetcher }) => usePolling(key, fetcher, { refreshMs: 30_000 }), {
      initialProps: { key: 'a', fetcher: fetcherA },
    })
    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'a' }))

    rerender({ key: 'b', fetcher: fetcherB })
    // Old key's data never leaks under the new key, even before the new key's first result.
    expect(result.current.data).toBeNull()
    expect(result.current.lastSuccessAt).toBeNull()

    await vi.waitFor(() => expect(result.current.data).toEqual({ value: 'b' }))

    // The old key's timer must be cancelled -- advancing time never calls fetcherA again.
    fetcherA.mockClear()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcherA).not.toHaveBeenCalled()
  })

  it('a null key means idle: no fetch, data reset', () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => usePolling(null, fetcher, { refreshMs: 30_000 }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current).toEqual({ data: null, error: null, lastSuccessAt: null })
  })

  it('stops scheduling once isDone returns true', async () => {
    const fetcher = vi.fn().mockResolvedValue({ finished: true })
    renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000, isDone: (d: { finished: boolean }) => d.finished }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1) // no further ticks scheduled at all
  })

  it('cleans up the timer and the visibilitychange listener on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => usePolling('k', fetcher, { refreshMs: 30_000 }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    fetcher.mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
