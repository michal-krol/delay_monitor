// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '../BottomSheet'
import type { VisibleItem } from './mapData'
import { OverviewPanel } from './OverviewPanel'

const ITEMS: VisibleItem[] = [
  { kind: 'vehicle', id: 'v1', label: '20 → Centrum', ageSec: 12 },
  { kind: 'stop', id: '100101', label: 'Centrum 01' },
  { kind: 'stop', id: '100102', label: 'Centrum 02' },
  { kind: 'rail', id: '33605', label: 'Warszawa Centralna' },
]
const READY = { state: 'ready' as const }

function panel(over: Partial<Parameters<typeof OverviewPanel>[0]> = {}) {
  const props = { items: ITEMS, overflow: false, feed: READY, onOpen: vi.fn(), ...over }
  return { ...render(<OverviewPanel {...props} />), props }
}

describe('OverviewPanel', () => {
  it('overview renders in a peek sheet with summary, age and legend', () => {
    render(
      <BottomSheet>
        <OverviewPanel items={ITEMS} overflow={false} feed={READY} onOpen={() => {}} />
      </BottomSheet>
    )
    // eslint-disable-next-line testing-library/no-node-access -- kontener przewijania nie ma roli
    expect(document.querySelector('.bottom-sheet')).toHaveAttribute('data-snap', 'peek')
    // Okno nie jest modalem ani dialogiem: mapa zostaje używalna, fokus nie jest przejmowany.
    expect(screen.queryByRole('dialog')).toBeNull()
    const region = screen.getByRole('region', { name: 'Pojazdy i przystanki w widoku' })
    expect(within(region).getByText('1 pojazd · 2 przystanki · 1 stacja kolejowa')).toBeInTheDocument()
    expect(within(region).getByText('Pozycje sprzed 12 s')).toBeInTheDocument()
    const legend = within(region).getByRole('list', { name: 'Legenda rodzajów' })
    expect(within(legend).getAllByRole('listitem')).toHaveLength(5)
    expect(document.body).toHaveFocus() // nie przejmuje fokusu (w odróżnieniu od PanelFrame)
  })

  it('expanding the overview sheet lists visible objects', () => {
    const onOpen = vi.fn()
    render(
      <BottomSheet>
        <OverviewPanel items={ITEMS} overflow={false} feed={READY} onOpen={onOpen} />
      </BottomSheet>
    )
    fireEvent.click(screen.getByRole('button', { name: /^Zmień wysokość panelu/ }))
    // eslint-disable-next-line testing-library/no-node-access -- kontener przewijania nie ma roli
    expect(document.querySelector('.bottom-sheet')).toHaveAttribute('data-snap', 'half')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Stacje kolejowe', 'Przystanki', 'Pojazdy'])
    fireEvent.click(screen.getByRole('button', { name: 'Centrum 02' }))
    expect(onOpen).toHaveBeenCalledWith({ kind: 'stop', id: '100102', label: 'Centrum 02' })
  })

  it('has exactly one scroll owner, the body marked for the sheet', () => {
    const { container } = panel()
    // eslint-disable-next-line testing-library/no-node-access -- znacznik przewijania nie ma roli
    expect(container.querySelectorAll('[data-sheet-scroll]')).toHaveLength(1)
  })

  it('vehicle rows say how old the GPS position is', () => {
    panel({ items: [{ kind: 'vehicle', id: 'v1', label: '20 → Centrum', ageSec: 130 }] })
    expect(screen.getByRole('button', { name: /Linia 20 → Centrum/ })).toHaveTextContent('Pozycja sprzed 2 min')
  })

  it('overflow names no total: the cap and the hint to zoom in, once', () => {
    panel({ overflow: true })
    expect(screen.getByText('Pierwsze 100 obiektów')).toBeInTheDocument()
    expect(screen.getAllByText('Przybliż mapę, aby zobaczyć więcej')).toHaveLength(1)
    expect(screen.queryByText(/pojazd/)).toBeNull()
  })

  it('tells "still counting" apart from "nothing in view" and offers to clear filters', () => {
    const onClearFilters = vi.fn()
    const { rerender } = render(<OverviewPanel items={null} overflow={false} feed={READY} onOpen={() => {}} onClearFilters={onClearFilters} />)
    expect(screen.getByText('Liczę obiekty w kadrze…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wyczyść filtry' })).toBeNull()
    rerender(<OverviewPanel items={[]} overflow={false} feed={READY} onOpen={() => {}} onClearFilters={onClearFilters} />)
    expect(screen.getByText('Brak obiektów w kadrze')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    expect(onClearFilters).toHaveBeenCalledOnce()
  })

  it('the age is the median GPS age of the visible vehicles (even count: mean of the middle two)', () => {
    const vehicle = (id: string, ageSec: number): VisibleItem => ({ kind: 'vehicle', id, label: '20', ageSec })
    const { rerender } = render(<OverviewPanel items={[vehicle('a', 10), vehicle('b', 300), vehicle('c', 20)]} overflow={false} feed={READY} onOpen={() => {}} />)
    expect(screen.getByText('Pozycje sprzed 20 s')).toBeInTheDocument()
    rerender(<OverviewPanel items={[vehicle('a', 10), vehicle('b', 30), vehicle('c', 20), vehicle('d', 400)]} overflow={false} feed={READY} onOpen={() => {}} />)
    expect(screen.getByText('Pozycje sprzed 25 s')).toBeInTheDocument()
  })

  it('no visible vehicle age means no claim (never "sprzed 0 s"); loading, failed and "none in view" are three different words', () => {
    const stopsOnly: VisibleItem[] = [{ kind: 'stop', id: '1', label: 'Centrum 01' }]
    const { rerender } = render(<OverviewPanel items={stopsOnly} overflow={false} feed={READY} onOpen={() => {}} />)
    expect(screen.queryByText(/Pozycje sprzed/)).toBeNull()
    expect(screen.getByText('Brak pojazdów w widoku')).toBeInTheDocument()
    rerender(<OverviewPanel items={null} overflow={false} feed={READY} onOpen={() => {}} />)
    expect(screen.queryByText('Brak pojazdów w widoku')).toBeNull() // kadr jeszcze nieliczony: nie wiemy
    rerender(<OverviewPanel items={stopsOnly} overflow={false} feed={{ state: 'loading' }} onOpen={() => {}} />)
    expect(screen.getByText('Wczytywanie pozycji pojazdów…')).toBeInTheDocument()
    rerender(<OverviewPanel items={stopsOnly} overflow={false} feed={{ state: 'failed' }} onOpen={() => {}} />)
    expect(screen.getByText('Nie udało się pobrać pozycji pojazdów')).toBeInTheDocument()
    rerender(<OverviewPanel items={[{ kind: 'vehicle', id: 'v', label: '20', ageSec: 400 }]} overflow={false} feed={{ state: 'failed' }} onOpen={() => {}} />)
    expect(screen.getByText('Nie udało się odświeżyć · Pozycje sprzed 7 min')).toBeInTheDocument()
  })
})
