// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RailStationList } from './RailStationList'

const useBoard = vi.fn()
vi.mock('@/hooks/useBoard', () => ({ useBoard: (...a: unknown[]) => useBoard(...a) }))

describe('RailStationList', () => {
  it('links each station to its board and shows stats when available', () => {
    useBoard.mockReturnValue({
      data: {
        snapshots: [
          { stationId: '33605', stats: { averageDelayMinutes: 4, punctualityPct: 91 } },
        ],
      },
    })
    render(
      <RailStationList
        stations={[
          { id: '33605', name: 'Warszawa Centralna' },
          { id: '7500', name: 'Warszawa Zachodnia' },
        ]}
      />
    )
    expect(screen.getByRole('link', { name: /Warszawa Centralna/ })).toHaveAttribute(
      'href',
      '/odjazdy/33605?name=Warszawa%20Centralna'
    )
    expect(screen.getByText(/śr\. opóźnienie 4 min · punktualność 91%/)).toBeInTheDocument()
  })

  it('shows a "no rail stations" message for an empty list, not a blank column', () => {
    useBoard.mockReturnValue({ data: null })
    render(<RailStationList stations={[]} />)
    expect(screen.getByText(/Brak stacji kolejowych w rejestrze/)).toBeInTheDocument()
  })
})
