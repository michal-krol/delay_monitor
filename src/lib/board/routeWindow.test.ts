import { describe, expect, it } from 'vitest'
import { COLLAPSE_MIN_STOPS, collapsedStopRange } from './routeWindow'

describe('collapsedStopRange', () => {
  it('returns null for ≤ 8 stops', () => {
    expect(COLLAPSE_MIN_STOPS).toBe(8)
    expect(collapsedStopRange({ stopCount: 8, confirmedIndex: 3, anchorIndex: 3 })).toBeNull()
    expect(collapsedStopRange({ stopCount: 2, confirmedIndex: -1, anchorIndex: -1 })).toBeNull()
  })

  it('starts at last confirmed and ends two after the anchor', () => {
    expect(collapsedStopRange({ stopCount: 14, confirmedIndex: 4, anchorIndex: 4 })).toEqual({ from: 4, to: 6 })
  })

  it('no confirmation and no anchor shows the first three', () => {
    expect(collapsedStopRange({ stopCount: 14, confirmedIndex: -1, anchorIndex: -1 })).toEqual({ from: 0, to: 2 })
  })

  it('schedule projection (no confirmed) starts at the anchor', () => {
    expect(collapsedStopRange({ stopCount: 14, confirmedIndex: -1, anchorIndex: 5 })).toEqual({ from: 5, to: 7 })
  })

  it('finished journey (last confirmed) still shows three rows', () => {
    expect(collapsedStopRange({ stopCount: 10, confirmedIndex: 9, anchorIndex: 9 })).toEqual({ from: 7, to: 9 })
  })

  it('stale projection window contains the anchor', () => {
    const range = collapsedStopRange({ stopCount: 14, confirmedIndex: 2, anchorIndex: 6 })
    expect(range).toEqual({ from: 2, to: 8 })
    expect(range!.from).toBeLessThanOrEqual(6)
    expect(range!.to).toBeGreaterThanOrEqual(6)
  })

  it('clamps to the list end; null when the window covers everything', () => {
    expect(collapsedStopRange({ stopCount: 9, confirmedIndex: 6, anchorIndex: 7 })).toEqual({ from: 6, to: 8 })
    expect(collapsedStopRange({ stopCount: 9, confirmedIndex: 0, anchorIndex: 6 })).toBeNull()
  })
})
