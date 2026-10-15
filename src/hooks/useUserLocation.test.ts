// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUserLocation } from './useUserLocation'

describe('useUserLocation', () => {
  it('throws a clear error outside UserLocationProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useUserLocation())).toThrow(/UserLocationProvider/)
  })
})
