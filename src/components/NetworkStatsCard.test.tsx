// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkStatsCard } from './NetworkStatsCard'
import { resetNetworkStatsHookForTests } from '@/hooks/useNetworkStats'
import { jsonResponse } from '@/test-utils/http'

const STATS = {
  statistics: {
    generatedAt: '2026-08-27T18:12:00Z',
    totalTrains: 7250,
    notStarted: 3683,
    inProgress: 608,
    completed: 2937,
    cancelled: 3,
    partialCancelled: 19,
    onTimePct: 99.7,
  },
  topCarriers: [],
  disruptionCount: 235,
  history: [],
}

beforeEach(() => {
  resetNetworkStatsHookForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('NetworkStatsCard', () => {
  it('keeps the collapsed subtitle short (no train count, no static "zgodnie z planem") so it never gets truncated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))

    render(<NetworkStatsCard />)

    expect(await screen.findByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
    expect(screen.queryByText(/7\s?250 pociągów/)).not.toBeInTheDocument()
    expect(screen.queryByText('zgodnie z planem')).not.toBeInTheDocument()
  })

  it('does not draw the on-time completion ring next to the collapsed title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))

    render(<NetworkStatsCard />)
    await screen.findByText(/^\d{2}:\d{2}$/)

    const header = screen.getByRole('button', { name: /Dziś w Polsce/ })
    // Pierścień to dekoracyjny <svg>, bez roli dostępności -- jedyny sposób
    // sprawdzić jego brak to zapytanie o sam element.
    // eslint-disable-next-line testing-library/no-node-access
    expect(header.querySelector('circle')).toBeNull()
  })

  it('shows the total train count in the expanded panel instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText(/^\d{2}:\d{2}$/)
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    expect(screen.getByText(/7.?250/)).toBeInTheDocument()
  })

  it('shows an icon next to the disruption count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText(/^\d{2}:\d{2}$/)
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    // getByText trafia w samo <p> (ikona to rodzeństwo bez własnego tekstu).
    // Ikona jest dekoracyjna (aria-hidden) -- bez roli dostępności, więc
    // jedyny sposób sprawdzić jej obecność to zapytanie o sam element.
    const disruptionLine = screen.getByText(/zgłoszonych utrudnień/)
    // eslint-disable-next-line testing-library/no-node-access
    expect(disruptionLine.querySelector('svg')).not.toBeNull()
  })

  it('first fetch failed: shows the card with an error subtitle instead of rendering nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sieć padła')))

    render(<NetworkStatsCard />)

    expect(await screen.findByText('Nie udało się pobrać danych')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dziś w Polsce/ })).toBeInTheDocument()
  })

  it('snapshot + refresh error: marks the header time as stale instead of hiding the last good snapshot', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(STATS))
      .mockRejectedValueOnce(new Error('sieć padła'))
    vi.stubGlobal('fetch', fetchMock)

    render(<NetworkStatsCard />)
    await vi.waitFor(() => expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument())

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)

    await vi.waitFor(() => expect(screen.getByText(/^nieaktualne · \d{2}:\d{2}$/)).toBeInTheDocument())
  })

  it('statistics unknown: subtitle reads "Brak danych o ruchu" and the expanded panel shows a dash instead of a fabricated count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...STATS, statistics: null })))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText('Brak danych o ruchu')
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    expect(screen.getByText(/Pociągów łącznie · —/)).toBeInTheDocument()
    // Legenda pierścienia (rozbita na statusy) istnieje tylko razem z pierścieniem -- jej brak == brak pierścienia.
    expect(screen.queryByText(/Zakończone ·/)).not.toBeInTheDocument()
  })

  it('disruption count unknown: the line reads a dash instead of "0 zgłoszonych utrudnień"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ ...STATS, disruptionCount: null })))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText(/^\d{2}:\d{2}$/)
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    expect(screen.getByText('— zgłoszonych utrudnień na sieci')).toBeInTheDocument()
  })
})
