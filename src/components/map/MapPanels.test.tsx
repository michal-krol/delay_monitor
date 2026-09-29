// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FavouritesMenu, NearbyPanel, VisibleListPanel } from './MapPanels'
import type { NearbyPoint } from './mapData'

const transitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...args: unknown[]) => transitBoard(...args) }))

const stopPoint: NearbyPoint = {
  kind: 'stop',
  stop: { id: '100101', groupId: '1001', name: 'Centrum', code: '01', lat: 52.23, lon: 21.01, mode: 'bus' },
  distanceM: 84,
}
const railPoint: NearbyPoint = { kind: 'rail', id: '33605', name: 'Warszawa Centralna', lat: 52.228, lon: 21.003, distanceM: 1250 }

beforeEach(() => transitBoard.mockReset())

describe('NearbyPanel', () => {
  it('lists points by distance with the next timetable departure of nearby stops', () => {
    transitBoard.mockReturnValue({
      data: { stops: [{ stopId: '100101', departures: [{ line: '128', headsign: 'Dworzec', plannedAt: '2026-09-26T20:31:00+02:00' }] }] },
      error: null,
    })
    const onOpen = vi.fn()
    render(<NearbyPanel points={[stopPoint, railPoint]} city="warszawa" onOpen={onOpen} onClose={() => {}} />)
    expect(transitBoard).toHaveBeenCalledWith('warszawa', ['100101'], 1)
    expect(screen.getByRole('dialog', { name: 'W pobliżu' })).toBeInTheDocument()
    expect(screen.getByText('Centrum 01')).toBeInTheDocument()
    expect(screen.getByText('80 m')).toBeInTheDocument()
    expect(screen.getByText('1,3 km')).toBeInTheDocument()
    expect(screen.getByText(/rozkład: 128/)).toHaveTextContent('rozkład: 128 do Dworzec o 20:31')
    fireEvent.click(screen.getByRole('button', { name: /Warszawa Centralna/ }))
    expect(onOpen).toHaveBeenCalledWith(railPoint)
  })

  it('says nothing is around rather than showing an empty list, and does not fetch', () => {
    transitBoard.mockReturnValue({ data: null, error: null })
    const onClose = vi.fn()
    render(<NearbyPanel points={[]} city="warszawa" onOpen={() => {}} onClose={onClose} />)
    expect(transitBoard).toHaveBeenCalledWith(null, [], 1)
    expect(screen.getByText('Brak stacji i przystanków w promieniu 500 m.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij „W pobliżu”' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('VisibleListPanel', () => {
  it('groups visible objects, sorts vehicles by line and notes the cap', () => {
    const onOpen = vi.fn()
    render(
      <VisibleListPanel
        items={[
          { kind: 'vehicle', id: 'b', label: '128' },
          { kind: 'vehicle', id: 'a', label: '20' },
          { kind: 'rail', id: '33605', label: 'Warszawa Centralna' },
          { kind: 'stop', id: '100101', label: 'Centrum 01' },
        ]}
        overflow
        onOpen={onOpen}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('4+ obiektów')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Stacje kolejowe', 'Przystanki', 'Pojazdy'])
    const vehicles = screen.getAllByRole('button', { name: /^Linia/ }).map((b) => b.textContent)
    expect(vehicles).toEqual(['Linia 20', 'Linia 128'])
    fireEvent.click(screen.getByRole('button', { name: 'Centrum 01' }))
    expect(onOpen).toHaveBeenCalledWith({ kind: 'stop', id: '100101', label: 'Centrum 01' })
    expect(screen.getByText(/przybliż, żeby zobaczyć resztę/)).toBeInTheDocument()
  })

  it('tells "still counting" apart from "nothing in view"', () => {
    const { rerender } = render(<VisibleListPanel items={null} overflow={false} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Liczę obiekty w kadrze…')).toBeInTheDocument()
    rerender(<VisibleListPanel items={[]} overflow={false} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.getByText(/W tym kadrze nic nie widać/)).toBeInTheDocument()
  })
})

describe('FavouritesMenu', () => {
  it('is absent without favourites, otherwise jumps to the chosen one', () => {
    const { rerender } = render(<FavouritesMenu favourites={[]} onOpen={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Przypięte' })).toBeNull()
    const onOpen = vi.fn()
    const fav = { key: 'pkp:33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0 }
    rerender(<FavouritesMenu favourites={[fav]} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: 'Przypięte' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Warszawa Centralna' }))
    expect(onOpen).toHaveBeenCalledWith(fav)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.pointerDown(document.body)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})
