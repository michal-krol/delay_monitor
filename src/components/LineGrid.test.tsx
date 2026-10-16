// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LineGrid, LineResults, RecentLines, SECTION_LABEL, splitEndStops } from './LineGrid'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode, LineKind } from '@/lib/gtfs/types'

const entry = (routeId: string, mode: GtfsMode, over: Partial<LineListEntry> = {}): LineListEntry => ({
  routeId,
  line: routeId,
  longName: `${routeId} start – ${routeId} koniec`,
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
  it('a tile links to the line page, named "Linia N: A – B", showing A and B joined by the direction arrow icon', () => {
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Linia M1: Kabaty – Młociny' })
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
    expect(link).toHaveTextContent('Kabaty Młociny')
    // Strzałka kierunku z jednego źródła ikon (`ArrowRightIcon`), nie znak „→” (.claude/rules/ui-icons.md).
    expect(link).not.toHaveTextContent('→')
    // eslint-disable-next-line testing-library/no-node-access -- dekoracyjna ikona (aria-hidden), nazwa linku niesie kierunek
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
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

  it('renders a non-empty rail group', () => {
    const withRail = { ...lines, rail: [entry('S1', 'rail', { longName: 'Pruszków – Otwock' })] }
    render(<LineGrid linesByMode={withRail} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    expect(SECTION_LABEL.rail).toBe('Kolej miejska')
    const rail = screen.getAllByTestId('line-section')[3]
    // eslint-disable-next-line testing-library/no-node-access -- <summary> nie ma roli ARIA
    expect(rail.querySelector('summary')?.textContent).toMatch(/^Kolej miejska.*1 linia$/)
    expect(within(rail).getByRole('link', { name: 'Linia S1: Pruszków – Otwock' })).toHaveAttribute('href', '/city/warszawa/line/S1')
  })

  it.each([
    ['bus', entry('128', 'bus', { longName: 'Dworzec – Bemowo' })],
    ['tram', entry('20', 'tram', { longName: 'Piaski – Annopol' })],
    ['metro', entry('M1', 'metro', { longName: 'Kabaty – Młociny' })],
    ['rail', entry('S1', 'rail', { longName: 'Pruszków – Otwock' })],
  ] as const)('link names are „Linia N: …" for %s', (mode, line) => {
    const grouped = { metro: [], tram: [], bus: [], rail: [], other: [], [mode]: [line] }
    render(<LineGrid linesByMode={grouped} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    expect(screen.getByRole('link', { name: `Linia ${line.line}: ${line.longName}` })).toHaveAttribute('href', `/city/warszawa/line/${line.routeId}`)
    // Ta sama ikona i etykieta trybu w nagłówku sekcji, niezależnie od trybu.
    expect(screen.getByTestId('line-section')).toBeInTheDocument()
  })

  it('long longName is fully rendered and wraps (no truncate)', () => {
    const long = 'Bardzo długa nazwa przystanku początkowego – Jeszcze dłuższa nazwa przystanku końcowego w innej dzielnicy'
    render(<LineGrid linesByMode={{ ...lines, tram: [entry('20', 'tram', { longName: long })] }} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    const link = screen.getByRole('link', { name: `Linia 20: ${long}` })
    expect(link).toHaveTextContent('Bardzo długa nazwa przystanku początkowego')
    expect(link).toHaveTextContent('Jeszcze dłuższa nazwa przystanku końcowego w innej dzielnicy')
    // eslint-disable-next-line testing-library/no-node-access -- sprawdzamy klasy układu, nie rolę
    expect(link.querySelector('.truncate')).toBeNull()
    expect(link.className).not.toContain('truncate')
  })

  it('openByDefault opens every section and bus subsection', () => {
    const isOpen = vi.fn((_key: string, _count: number, openByDefault?: boolean) => openByDefault === true)
    render(<LineGrid linesByMode={lines} city="warszawa" isOpen={isOpen} onToggle={vi.fn()} openByDefault />)
    for (const section of screen.getAllByTestId('line-section')) expect(section).toHaveAttribute('open')
    for (const sub of screen.getAllByTestId('line-subsection')) expect(sub).toHaveAttribute('open')
  })

  it('night and local bus badges keep darkRingClass', () => {
    render(<LineGrid linesByMode={{ ...lines, bus: [bus('N16', 'night'), bus('L-1', 'local'), bus('128', 'regular')] }} city="warszawa" isOpen={always} onToggle={vi.fn()} />)
    for (const [name, ring] of [['N16', true], ['L-1', true], ['128', false]] as const) {
      // eslint-disable-next-line testing-library/no-node-access -- plakietka nie ma roli
      const badge = screen.getByRole('link', { name: new RegExp(`^Linia ${name}:`) }).querySelector('span.font-semibold')
      expect(badge?.className.includes('dark:ring-1')).toBe(ring)
    }
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

  it('empty results show „Brak pasujących linii" and „Wyczyść filtry" calls onClear', async () => {
    const onClear = vi.fn()
    render(<LineResults lines={[]} city="warszawa" onClear={onClear} />)
    expect(screen.getByText('Brak pasujących linii')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('an empty result has no „Wyniki · 0" heading', () => {
    render(<LineResults lines={[]} city="warszawa" />)
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('an empty result without onClear offers no button', () => {
    render(<LineResults lines={[]} city="warszawa" />)
    expect(screen.getByText('Brak pasujących linii')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('rows show the full name, wrapping, with a chevron', () => {
    const long = 'Bardzo długa nazwa początkowa – Bardzo długa nazwa końcowa'
    render(<LineResults lines={[entry('N16', 'bus', { kind: 'night', longName: long })]} city="warszawa" />)
    const link = screen.getByRole('link', { name: `Linia N16: ${long}, nocna` })
    expect(link).toHaveTextContent('Bardzo długa nazwa końcowa')
    expect(link.className).not.toContain('truncate')
    // eslint-disable-next-line testing-library/no-node-access -- sprawdzamy klasy układu i dekoracyjną ikonę
    expect(link.querySelector('.truncate')).toBeNull()
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

  it('RecentLines skips unknown routeId', () => {
    render(<RecentLines recent={['GONE', 'M1']} lines={all} city="warszawa" />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Linia M1: M1 start – M1 koniec' })).toHaveAttribute('href', '/city/warszawa/line/M1')
  })

  it('skips unknown ids and keeps the stored order', () => {
    render(<RecentLines recent={['128', 'GONE', 'M1']} lines={all} city="warszawa" />)
    expect(screen.getByText('Ostatnio oglądane')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/city/warszawa/line/128', '/city/warszawa/line/M1'])
  })
})
