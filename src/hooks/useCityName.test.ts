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
})
