// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransitStopCard } from './TransitStopCard'

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...a: unknown[]) => useTransitBoard(...a) }))

describe('TransitStopCard', () => {
  it('shows the stop name, a schedule label (not "na czas"), and links to the stop page', () => {
    useTransitBoard.mockReturnValue({
      data: {
        stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }],
        schedule: { state: 'ready' },
        attribution: [],
      },
      error: null,
    })
    render(<TransitStopCard city="waw" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText(/Rozkład — waw/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pokaż przystanek/ })).toHaveAttribute(
      'href',
      '/miasto/waw/przystanek/7014M'
    )
  })

  it('calls onRemove without following the card link', async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null })
    const onRemove = vi.fn()
    render(<TransitStopCard city="waw" stopId="7014M" stopName="Świętokrzyska" onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /Odepnij z Pulpitu/ }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit error when the schedule could not load', () => {
    useTransitBoard.mockReturnValue({ data: null, error: 'network' })
    render(<TransitStopCard city="waw" stopId="7014M" stopName="Świętokrzyska" onRemove={vi.fn()} />)
    expect(screen.getByText('Nie udało się wczytać rozkładu')).toBeInTheDocument()
  })
})
