// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkStats } from './useNetworkStats'
import { jsonResponse } from '@/test-utils/http'

const STATS = {
  generatedAt: '2026-08-27T18:00:00Z',
  totalTrains: 7250,
  notStarted: 3683,
  inProgress: 608,
  completed: 2937,
  cancelled: 3,
  partialCancelled: 19,
  onTimePct: 99.7,
  topCarriers: [],
  disruptionCount: 235,
  history: [],
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useNetworkStats', () => {
  it('starts with no data on the very first mount (nothing cached yet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))

    const { result } = renderHook(() => useNetworkStats())

    expect(result.current.data).toBeNull()
    await vi.waitFor(() => expect(result.current.data).not.toBeNull())
  })

  it('shows the last successfully fetched value immediately on remount, instead of flashing back to loading', async () => {
    // Zaobserwowane: nawigacja z pulpitu i powrót odmontowuje karte -- stan
    // per-mount (useState(null)) gubił ostatnią wartość, mimo że serwer wciąż
    // ma ją scache'owaną (networkStats.ts, TTL 15 min) i odpowiada natychmiast.
    // Widżet migał "Wczytywanie..." przy każdym powrocie, mylnie sugerując, że
    // coś się od nowa liczy.
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(STATS))
    vi.stubGlobal('fetch', fetchMock)

    const { result: firstResult, unmount } = renderHook(() => useNetworkStats())
    await vi.waitFor(() => expect(firstResult.current.data).not.toBeNull())
    unmount()

    const { result: secondResult } = renderHook(() => useNetworkStats())
    expect(secondResult.current.data).toEqual(STATS)
  })
})
