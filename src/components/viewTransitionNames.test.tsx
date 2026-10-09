// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Nazwa współdzielonego elementu: ma ją tylko JEDEN kafelek na grupę przystanków (duplikat przerywa przejście).
vi.mock('./PlaceTitle', () => ({
  PlaceTitle: ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div data-testid="place-title" data-id={id}>
      {children}
    </div>
  ),
}))
const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...args: unknown[]) => useTransitBoard(...args) }))

import { TransitStopCard } from './TransitStopCard'

function board(groupId: string) {
  return {
    data: { stops: [{ stopId: groupId, groupId, name: 'Centrum', modes: ['tram'], departures: [], members: [] }], schedule: { state: 'ready' }, attribution: [] },
    error: null,
    loading: false,
    failed: false,
  }
}

describe('TransitStopCard shared title', () => {
  it('a pinned stop group owns the shared name', () => {
    useTransitBoard.mockReturnValue(board('1001'))
    render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
    expect(screen.getByTestId('place-title')).toHaveAttribute('data-id', 'warszawa:1001')
  })

  it('a pinned SINGLE stop of the same group does not (its group card already has the name)', () => {
    useTransitBoard.mockReturnValue(board('1001'))
    render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum 02" member />)
    expect(screen.queryByTestId('place-title')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Centrum 02' })).toBeInTheDocument()
  })
})
