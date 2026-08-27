// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkStatsCard } from './NetworkStatsCard'
import { jsonResponse } from '@/test-utils/http'

const STATS = {
  generatedAt: '2026-08-27T18:12:00Z',
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NetworkStatsCard', () => {
  it('keeps the collapsed subtitle short (no train count) so it never gets truncated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))

    render(<NetworkStatsCard />)

    expect(await screen.findByText('zgodnie z planem')).toBeInTheDocument()
    expect(screen.queryByText(/7\s?250 pociągów/)).not.toBeInTheDocument()
  })

  it('shows the total train count in the expanded panel instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText('zgodnie z planem')
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    expect(screen.getByText(/7.?250/)).toBeInTheDocument()
  })

  it('shows an icon next to the disruption count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(STATS)))
    const user = userEvent.setup()

    render(<NetworkStatsCard />)
    await screen.findByText('zgodnie z planem')
    await user.click(screen.getByRole('button', { name: /Dziś w Polsce/ }))

    // getByText trafia w samo <p> (ikona to rodzeństwo bez własnego tekstu).
    // Ikona jest dekoracyjna (aria-hidden) -- bez roli dostępności, więc
    // jedyny sposób sprawdzić jej obecność to zapytanie o sam element.
    const disruptionLine = screen.getByText(/zgłoszonych utrudnień/)
    // eslint-disable-next-line testing-library/no-node-access
    expect(disruptionLine.querySelector('svg')).not.toBeNull()
  })
})
