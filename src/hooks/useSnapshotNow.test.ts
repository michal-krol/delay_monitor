// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSnapshotNow } from './useSnapshotNow'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSnapshotNow', () => {
  it('reads "now" once on mount, without a transient 0 on the first render', () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    const { result } = renderHook(() => useSnapshotNow('a'))
    expect(result.current).toBe(new Date('2026-08-01T12:00:00Z').getTime())
  })

  it('refreshes "now" only when the dependency changes, not on every render', () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    const { result, rerender } = renderHook(({ dep }) => useSnapshotNow(dep), { initialProps: { dep: 'a' } })
    const first = result.current

    vi.setSystemTime(new Date('2026-08-01T12:05:00Z'))
    rerender({ dep: 'a' })
    expect(result.current).toBe(first)

    rerender({ dep: 'b' })
    expect(result.current).toBe(new Date('2026-08-01T12:05:00Z').getTime())
  })
})
