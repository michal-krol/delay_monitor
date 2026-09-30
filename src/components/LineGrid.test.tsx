// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LineGrid, LineResults, RecentLines, splitEndStops } from './LineGrid'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode, LineKind } from '@/lib/gtfs/types'

const entry = (routeId: string, mode: GtfsMode, over: Partial<LineListEntry> = {}): LineListEntry => ({
  routeId,
  line: routeId,
  longName: `${routeId} start – ${routeId} koniec`,
  color: null,
  textColor: '#000000',
  mode,
  kind: 'regular',
  ...over,
})
const bus = (routeId: string, kind: LineKind) => entry(routeId, 'bus', { kind })

const lines = {
  metro: [entry('M1', 'metro', { longName: 'Kabaty – Młociny' })],
  tram: [entry('20', 'tram', { longName: 'Piaski' })],
  bus: [bus('521', 'express'), bus('128', 'regular'), bus('N16', 'night')],
  rail: [],
  other: [],
}

const always = () => true

describe('splitEndStops', () => {
  it('splits on the first " – "', () => {
    expect(splitEndStops('Kabaty – Młociny')).toEqual(['Kabaty', 'Młociny'])
    expect(splitEndStops('A – B – C')).toEqual(['A', 'B – C'])
  })

  it('returns null when there is no separator (a hyphen is part of a stop name)', () => {
    expect(splitEndStops('Piaski')).toBeNull()
    expect(splitEndStops('Młociny - UKSW')).toBeNull()
  })
})

describe('LineGrid', () => {
  it('a tile links to the line page, named "Linia N: A – B", showing "A → B"', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Linia M1: Kabaty – Młociny' })
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
    expect(link).toHaveTextContent('Kabaty → Młociny')
  })

  it('falls back to the whole longName when it has no end-stop separator', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Linia 20: Piaski' })
    expect(link).toHaveTextContent('Piaski')
    expect(link).not.toHaveTextContent('→')
  })

  it('shows a section per non-empty mode with a count, ordered metro → tram → bus', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const sections = screen.getAllByTestId('line-section')
    // eslint-disable-next-line testing-library/no-node-access -- <summary> nie ma roli ARIA, do której dałoby się sięgnąć zapytaniem
    expect(sections.map((s) => s.querySelector('summary')?.textContent)).toEqual([
      expect.stringMatching(/^Metro.*1 linia$/),
      expect.stringMatching(/^Tramwaje.*1 linia$/),
      expect.stringMatching(/^Autobusy.*3 linie$/),
    ])
  })

  it('bus subsections follow the kind order and only non-empty ones render', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const busSection = screen.getAllByTestId('line-section')[2]
    const subs = within(busSection).getAllByTestId('line-subsection')
    // eslint-disable-next-line testing-library/no-node-access -- jw.
    expect(subs.map((s) => s.querySelector('summary')?.textContent)).toEqual([
      expect.stringMatching(/^zwykłe · 1/),
      expect.stringMatching(/^przyspieszone · 1/),
      expect.stringMatching(/^nocne \(N\) · 1/),
    ])
  })

  it('does not show a kind chip on tiles (only in search results)', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    expect(screen.getByRole('link', { name: /Linia N16/ })).not.toHaveTextContent('nocna')
  })

  it('open state comes from isOpen, keyed by mode and "bus:<kind>"', () => {
    const isOpen = vi.fn((key: string) => key === 'metro' || key === 'bus:night')
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={isOpen} onToggle={vi.fn()} />)
    const [metro, tram, busSec] = screen.getAllByTestId('line-section')
    expect(metro).toHaveAttribute('open')
    expect(tram).not.toHaveAttribute('open')
    expect(busSec).not.toHaveAttribute('open')
    const subs = within(busSec).getAllByTestId('line-subsection')
    expect(subs.map((s) => s.hasAttribute('open'))).toEqual([false, false, true])
    // sekcja autobusów trzyma tylko zwijane podsekcje — jej rozmiar nie wpływa na stan domyślny
    expect(isOpen).toHaveBeenCalledWith('bus', 0)
    expect(isOpen).toHaveBeenCalledWith('bus:night', 1)
  })

  it('reports a toggle with the key, the new state and the line count', async () => {
    const onToggle = vi.fn()
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={onToggle} />)
    // jsdom (jak przeglądarka) odpala `toggle` także po programowym ustawieniu `open` przy montowaniu —
    // dlatego hook porównuje z aktualnym stanem; tu przeczekujemy te zdarzenia i liczymy dopiero ręczne.
    await new Promise((resolve) => setTimeout(resolve, 0))
    onToggle.mockClear()
    const tram = screen.getAllByTestId('line-section')[1] as HTMLDetailsElement
    tram.open = false
    fireEvent(tram, new Event('toggle'))
    expect(onToggle).toHaveBeenCalledWith('tram', false, 1)
    const night = within(screen.getAllByTestId('line-section')[2]).getAllByTestId('line-subsection')[2] as HTMLDetailsElement
    night.open = false
    fireEvent(night, new Event('toggle'))
    expect(onToggle).toHaveBeenCalledWith('bus:night', false, 1)
  })
})

describe('LineResults', () => {
  const hits = [entry('M1', 'metro', { longName: 'Kabaty – Młociny' }), bus('N16', 'night'), bus('128', 'regular')]

  it('lists every hit as a link with the kind chip for non-regular kinds', () => {
    render(<LineResults lines={hits} city="warszawa" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Wyniki · 3' })).toBeInTheDocument()
    const night = screen.getByRole('link', { name: /^Linia N16: / })
    expect(night).toHaveAttribute('href', '/city/warszawa/line/N16')
    expect(night).toHaveTextContent('nocna')
    expect(screen.getByRole('link', { name: /^Linia 128: / })).not.toHaveTextContent('nocna')
  })

  it('explains an empty result instead of rendering nothing', () => {
    render(<LineResults lines={[]} city="warszawa" />)
    expect(screen.getByText('Brak linii pasujących do wyszukiwania.')).toBeInTheDocument()
  })
})

describe('RecentLines', () => {
  const all = [entry('M1', 'metro'), entry('20', 'tram'), bus('128', 'regular')]

  it('renders nothing when there is nothing recent', () => {
    const { container } = render(<RecentLines recent={[]} lines={all} city="warszawa" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when every stored id is unknown', () => {
    const { container } = render(<RecentLines recent={['GONE', '999']} lines={all} city="warszawa" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('skips unknown ids and keeps the stored order', () => {
    render(<RecentLines recent={['128', 'GONE', 'M1']} lines={all} city="warszawa" />)
    expect(screen.getByText('Ostatnio oglądane')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/city/warszawa/line/128', '/city/warszawa/line/M1'])
  })
})
