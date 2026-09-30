// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_CACHED_ENTRIES } from './pollingCache'
import { usePolling, type UsePollingOptions } from './usePolling'

// Cache to stan modułu, więc każdy test dostaje własne klucze/namespace.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

type Fetcher<T> = () => Promise<T>
const never = () => vi.fn().mockReturnValue(new Promise(() => {}))

function mount<T>(key: string, fetcher: Fetcher<T>, options: UsePollingOptions<T>) {
  return renderHook(() => usePolling(key, fetcher, options))
}

describe('usePolling cacheNamespace', () => {
  it('shows the last data immediately after remount, then refreshes in the background', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 'old' }).mockResolvedValue({ v: 'new' })
    const options = { refreshMs: 30_000, cacheNamespace: 't1' }
    const { result: first, unmount: unmountFirst } = mount('k', fetcher, options)
    await vi.waitFor(() => expect(first.current.data).toEqual({ v: 'old' }))
    const firstSuccessAt = first.current.lastSuccessAt
    unmountFirst()

    await vi.advanceTimersByTimeAsync(10_000)
    const { result: second } = mount('k', fetcher, options)
    // Zaraz po zamontowaniu, jeszcze przed odpowiedzią: dane z cache, nie null.
    expect(second.current.data).toEqual({ v: 'old' })
    // Wiek liczy się od pierwotnego sukcesu (#7), nie od zamontowania.
    expect(second.current.lastSuccessAt).toBe(firstSuccessAt)

    await vi.waitFor(() => expect(second.current.data).toEqual({ v: 'new' }))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not share data between keys or namespaces', async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 'a' })
    const { result: seeded, unmount: unmountSeed } = mount('a', fetcher, { refreshMs: null, cacheNamespace: 't2' })
    await vi.waitFor(() => expect(seeded.current.data).toEqual({ v: 'a' }))
    unmountSeed()

    expect(mount('b', never(), { refreshMs: null, cacheNamespace: 't2' }).result.current.data).toBeNull()
    expect(mount('a', never(), { refreshMs: null, cacheNamespace: 't2-other' }).result.current.data).toBeNull()
  })

  it('keeps the seeded data when the background refresh fails (#7)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ v: 'old' }).mockRejectedValue(new Error('down'))
    const options = { refreshMs: 30_000, cacheNamespace: 't3' }
    const { result: first, unmount: unmountFirst } = mount('k', fetcher, options)
    await vi.waitFor(() => expect(first.current.data).toEqual({ v: 'old' }))
    unmountFirst()

    const { result: second } = mount('k', fetcher, options)
    await vi.waitFor(() => expect(second.current.error).toBe('down'))
    expect(second.current.data).toEqual({ v: 'old' })
  })

  it('does not fetch again when the cached data is already final (isDone)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ done: true })
    const options = { refreshMs: 30_000, cacheNamespace: 't4', isDone: (d: { done: boolean }) => d.done }
    const { result: first, unmount: unmountFirst } = mount('k', fetcher, options)
    await vi.waitFor(() => expect(first.current.data).toEqual({ done: true }))
    unmountFirst()

    const { result: second } = mount('k', fetcher, options)
    expect(second.current.data).toEqual({ done: true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest entry beyond MAX_CACHED_ENTRIES', async () => {
    for (let i = 0; i <= MAX_CACHED_ENTRIES; i += 1) {
      const view = mount(`k${i}`, vi.fn().mockResolvedValue({ key: `k${i}` }), { refreshMs: null, cacheNamespace: 't5' })
      await vi.waitFor(() => expect(view.result.current.data).toEqual({ key: `k${i}` }))
      view.unmount()
    }
    expect(mount('k0', never(), { refreshMs: null, cacheNamespace: 't5' }).result.current.data).toBeNull()
    expect(mount(`k${MAX_CACHED_ENTRIES}`, never(), { refreshMs: null, cacheNamespace: 't5' }).result.current.data).toEqual({
      key: `k${MAX_CACHED_ENTRIES}`,
    })
  })

  it('without cacheNamespace nothing is remembered across mounts', async () => {
    const { result: seeded, unmount: unmountSeed } = mount('nc', vi.fn().mockResolvedValue({ v: 1 }), { refreshMs: null })
    await vi.waitFor(() => expect(seeded.current.data).toEqual({ v: 1 }))
    unmountSeed()
    expect(mount('nc', never(), { refreshMs: null }).result.current.data).toBeNull()
  })
})
