// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentPlaces } from './RecentPlaces'
import type { RecentPlace } from '@/hooks/useRecentPlaces'

const STORAGE_KEY = 'monitor.recentPlaces.v1'
const seed = (places: RecentPlace[]) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(places))
const pkp = (id: string): RecentPlace => ({ kind: 'pkp', id, name: `Stacja ${id}` })

beforeEach(() => window.localStorage.clear())

describe('RecentPlaces', () => {
  it('renders nothing when there are no places', () => {
    const { container } = render(<RecentPlaces limit={8} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows at most `limit` places under the heading', () => {
    seed([pkp('1'), pkp('2'), pkp('3')])
    render(<RecentPlaces limit={2} />)
    expect(screen.getByRole('heading', { name: 'Ostatnio oglądane' })).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('link')
    expect(items.map((link) => link.textContent)).toEqual(['Stacja 1', 'Stacja 2'])
    expect(items[0]).toHaveAttribute('href', '/station/1?name=Stacja%201')
  })

  it('uses the requested heading level', () => {
    seed([pkp('1')])
    render(<RecentPlaces limit={8} headingLevel="h3" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Ostatnio oglądane' })).toBeInTheDocument()
  })

  it('„Wyczyść" empties the list and hides the section', async () => {
    seed([pkp('1')])
    const user = userEvent.setup()
    render(<RecentPlaces limit={8} />)
    await user.click(screen.getByRole('button', { name: 'Wyczyść' }))
    expect(screen.queryByRole('heading', { name: 'Ostatnio oglądane' })).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('„Wyczyść" calls onCleared', async () => {
    seed([pkp('1')])
    const onCleared = vi.fn()
    const user = userEvent.setup()
    render(<RecentPlaces limit={8} onCleared={onCleared} />)
    await user.click(screen.getByRole('button', { name: 'Wyczyść' }))
    expect(onCleared).toHaveBeenCalledTimes(1)
  })

  it('links a single przystanek with ?przystanek=', () => {
    seed([{ kind: 'gtfs', city: 'warszawa', id: '1001', member: '100102', name: 'Centrum 02' }])
    render(<RecentPlaces limit={8} />)
    expect(screen.getByRole('link', { name: 'Centrum 02' })).toHaveAttribute('href', '/city/warszawa/stop/1001?przystanek=100102')
  })

  it('marks each place with its own mode glyph: PKP rail, GTFS from the saved modes, never a default bus', () => {
    seed([
      pkp('1'),
      { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum', modes: ['tram', 'bus'] },
      { kind: 'gtfs', city: 'warszawa', id: '7014', name: 'Świętokrzyska', modes: ['metro'] },
      { kind: 'gtfs', city: 'warszawa', id: '9009', name: 'Stary wpis' },
    ])
    render(<RecentPlaces limit={8} />)
    const modesOf = (name: string) =>
      within(screen.getByRole('link', { name }))
        .queryAllByTestId('mode-glyph')
        .map((node) => node.getAttribute('data-mode'))
    expect(modesOf('Stacja 1')).toEqual(['rail'])
    expect(modesOf('Centrum')).toEqual(['tram', 'bus'])
    expect(modesOf('Świętokrzyska')).toEqual(['metro'])
    // Wpis sprzed zapisu rodzajów: neutralny znak przystanku, nie autobus.
    expect(modesOf('Stary wpis')).toEqual([])
    expect(within(screen.getByRole('link', { name: 'Stary wpis' })).getByTestId('stop-glyph')).toBeInTheDocument()
  })

  it('a long name wraps in full instead of being cut off', () => {
    const name = 'Warszawa Wschodnia Osobowa z bardzo długą nazwą testową'
    seed([{ kind: 'pkp', id: '1', name }])
    render(<RecentPlaces limit={8} />)
    const text = within(screen.getByRole('link', { name })).getByText(name)
    expect(text).not.toHaveClass('truncate')
    expect(text).toHaveClass('[overflow-wrap:anywhere]')
  })
})
