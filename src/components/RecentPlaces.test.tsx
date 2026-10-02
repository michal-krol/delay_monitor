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
})
