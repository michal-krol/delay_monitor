// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCityName } from './useCityName'
import { jsonResponse } from '@/test-utils/http'

afterEach(() => vi.unstubAllGlobals())

describe('useCityName', () => {
  it('falls back to the id, then resolves the registry name', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa' }] })))
    const { result } = renderHook(() => useCityName('warszawa'))
    expect(result.current).toBe('warszawa')
    await waitFor(() => expect(result.current).toBe('Warszawa'))
  })

  it('keeps the id when the registry has no such city or the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('x'))))
    const { result } = renderHook(() => useCityName('krakow'))
    await waitFor(() => expect(result.current).toBe('krakow'))
  })

  it('keeps the id on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })))
    const { result } = renderHook(() => useCityName('krakow'))
    await vi.waitFor(() => expect(result.current).toBe('krakow'))
  })

  it('keeps the id when the registry resolves without a matching city', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa' }] })))
    const { result } = renderHook(() => useCityName('krakow'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toBe('krakow')
  })

  it('does not update after unmount', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    const { result, unmount } = renderHook(() => useCityName('warszawa'))
    unmount()
    resolveFetch({ ok: true, json: () => Promise.resolve({ cities: [{ id: 'warszawa', name: 'Warszawa' }] }) })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toBe('warszawa')
  })
})
