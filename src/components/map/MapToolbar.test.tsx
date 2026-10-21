// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveFilterChips, MapToolbar, NoPositionNotice } from './MapToolbar'
import { MapFilters } from './MapFilters'
import type { LayerKey } from './mapData'

type Props = React.ComponentProps<typeof MapToolbar>

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    isWide: false,
    search: <input aria-label="Stacja, przystanek, linia lub pociąg" />,
    hidden: new Set<LayerKey>(),
    vehicleLayers: ['buses', 'trams', 'trains'],
    onHiddenChange: vi.fn(),
    alertsOnly: false,
    onAlertsOnly: vi.fn(),
    lineActive: false,
    listOpen: false,
    onToggleList: vi.fn(),
    pinnedPoints: [],
    onOpenPinned: vi.fn(),
    onShare: vi.fn(),
    ...overrides,
  }
  render(<MapToolbar {...props} />)
  return props
}

describe('MapToolbar on a phone', () => {
  it('Lista and Filtry are rendered on phone widths without opening a menu', () => {
    setup()
    const list = screen.getByRole('button', { name: 'Lista' })
    const filters = screen.getByRole('button', { name: /^Filtry/ })
    expect(list).toHaveAttribute('aria-pressed', 'false')
    expect(filters).toHaveAttribute('aria-expanded', 'false')
    // Widoczne napisy, nie tylko dla czytnika: dwa pełne przyciski pod polem wyszukiwania.
    expect(within(list).getByText('Lista')).not.toHaveClass('sr-only')
    expect(within(filters).getByText('Filtry')).not.toHaveClass('sr-only')
    expect(list).toHaveClass('control-44')
    expect(screen.getByRole('button', { name: 'Więcej' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('Lista reflects and toggles the list', () => {
    const props = setup({ listOpen: true })
    const list = screen.getByRole('button', { name: 'Lista' })
    expect(list).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(list)
    expect(props.onToggleList).toHaveBeenCalledOnce()
  })

  it('"Więcej" holds only „Udostępnij widok" on a phone', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))
    const menu = screen.getByRole('list', { name: 'Więcej' })
    expect(within(menu).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(menu).getByRole('button', { name: 'Udostępnij widok' }))
    expect(props.onShare).toHaveBeenCalledOnce()
  })

  it('shows one mode chip per vehicle layer present, as pressed toggles', () => {
    setup({ hidden: new Set<LayerKey>(['trams']), vehicleLayers: ['buses', 'trams', 'trains'] })
    const group = screen.getByRole('group', { name: 'Rodzaje pojazdów' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['Autobusy', 'Tramwaje', 'Pociągi'])
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true'])
    expect(chips[0]).toHaveClass('chip-filter')
    // Czipy leżą nad etykietami kafelków: opaque tło (`globals.css`), nie półprzezroczyste `--surface-strong`.
    expect(chips[0]).toHaveClass('chip-filter-map')
  })

  it('shows no mode chip row without vehicles in the data', () => {
    setup({ vehicleLayers: [] })
    expect(screen.queryByRole('group', { name: 'Rodzaje pojazdów' })).toBeNull()
  })

  it('mode chip toggles the same hidden set as Filtry', () => {
    const hidden = new Set<LayerKey>(['busStops'])
    const props = setup({ hidden })
    fireEvent.click(screen.getByRole('button', { name: 'Tramwaje' }))
    const fromChip = [...(props.onHiddenChange as ReturnType<typeof vi.fn>).mock.calls[0][0]].sort()

    const onChange = vi.fn()
    render(<MapFilters hidden={hidden} vehicleLayers={['buses', 'trams', 'trains']} onChange={onChange} />)
    const panelButton = screen.getAllByRole('button', { name: /^Filtry/ })[1]
    fireEvent.click(panelButton)
    fireEvent.click(screen.getByRole('checkbox', { name: /Tramwaje/ }))
    expect(fromChip).toEqual([...onChange.mock.calls[0][0]].sort())
    expect(fromChip).toEqual(['busStops', 'trams'])

    // Ukryta warstwa wraca jednym kliknięciem tego samego czipa.
    fireEvent.click(screen.getByRole('button', { name: 'Autobusy' }))
    expect((props.onHiddenChange as ReturnType<typeof vi.fn>).mock.calls[1][0].has('buses')).toBe(true)
  })

  it('the Filtry badge counts hidden layers + the line + alerts-only', () => {
    setup({ hidden: new Set<LayerKey>(['busStops', 'trams']), lineActive: true, alertsOnly: true })
    expect(screen.getByRole('button', { name: /^Filtry/ })).toHaveTextContent('4 aktywnych ograniczeń')
  })

  it('has no count badge without restrictions', () => {
    setup()
    expect(screen.getByRole('button', { name: /^Filtry/ })).not.toHaveTextContent('aktywnych')
  })

  it('the Filtry panel opens inside the viewport width on a phone (spans the button row, not right-aligned to the button)', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Filtry/ }))
    // eslint-disable-next-line testing-library/no-node-access -- panel bez roli; szukamy go po `aria-controls` przycisku
    const panel = document.getElementById(screen.getByRole('button', { name: /^Filtry/ }).getAttribute('aria-controls')!)
    expect(panel?.className).toMatch(/max-sm:inset-x-0/)
  })
})

describe('MapToolbar on a wide screen', () => {
  it('keeps the desktop buttons and shows no mode chip row', () => {
    setup({ isWide: true })
    expect(screen.getByRole('button', { name: 'Lista' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filtry/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Udostępnij ten widok mapy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Więcej' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Rodzaje pojazdów' })).toBeNull()
  })

  it('an active list uses the primary fill through aria-pressed, not an inline gradient', () => {
    setup({ isWide: true, listOpen: true })
    const list = screen.getByRole('button', { name: 'Lista' })
    expect(list).toHaveAttribute('aria-pressed', 'true')
    expect(list.getAttribute('style') ?? '').not.toMatch(/accent/)
  })
})

describe('ActiveFilterChips', () => {
  const base = {
    hidden: new Set<LayerKey>(),
    line: null as { line: string } | null,
    alertsOnly: false,
    onClearLine: vi.fn(),
    onAlertsOnly: vi.fn(),
    onHiddenChange: vi.fn(),
    onClear: vi.fn(),
  }

  it('renders nothing without restrictions', () => {
    render(<ActiveFilterChips {...base} />)
    expect(screen.queryByRole('list', { name: 'Aktywne filtry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Wyczyść filtry' })).toBeNull()
  })

  it('lists line, alerts and hidden layers and offers „Wyczyść filtry" while the count is above zero', () => {
    const onClear = vi.fn()
    render(<ActiveFilterChips {...base} hidden={new Set<LayerKey>(['busStops'])} line={{ line: '175' }} alertsOnly onClear={onClear} />)
    const chips = screen.getByRole('list', { name: 'Aktywne filtry' })
    expect(within(chips).getByText('Linia 175')).toBeInTheDocument()
    expect(within(chips).getByText('Tylko linie z utrudnieniami')).toBeInTheDocument()
    expect(within(chips).getByText('Ukryte: przystanki autobusowe')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('a single chip removes only its own restriction', () => {
    const onClearLine = vi.fn()
    const onHiddenChange = vi.fn()
    render(<ActiveFilterChips {...base} hidden={new Set<LayerKey>(['busStops', 'trams'])} line={{ line: '175' }} onClearLine={onClearLine} onHiddenChange={onHiddenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż wszystkie linie zamiast linii 175' }))
    expect(onClearLine).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż: tramwaje' }))
    expect([...onHiddenChange.mock.calls[0][0]]).toEqual(['busStops'])
  })
})

describe('NoPositionNotice', () => {
  const notice = { name: 'Stacja X', href: '/station/1', linkLabel: 'Szczegóły stacji' }
  const status = () => screen.getAllByRole('status').find((el) => /Brak pozycji na mapie/.test(el.textContent ?? ''))!

  it('takes focus when it appears and shows the details link', () => {
    render(<NoPositionNotice notice={notice} onClose={() => {}} />)
    expect(status()).toHaveFocus()
    expect(within(status()).getByRole('link', { name: 'Szczegóły stacji' })).toHaveAttribute('href', '/station/1')
  })

  it('takes focus once per notice object: a remount with the same notice (the keyed sheet slot) leaves focus alone, a new notice takes it', () => {
    const first = { name: 'Stacja A', href: null, linkLabel: 'Szczegóły stacji' }
    const second = { name: 'Stacja B', href: null, linkLabel: 'Szczegóły stacji' }
    const outside = document.createElement('button')
    document.body.append(outside)
    const { unmount } = render(<NoPositionNotice notice={first} onClose={() => {}} />)
    expect(status()).toHaveFocus()
    unmount()
    outside.focus()
    const { unmount: unmountAgain } = render(<NoPositionNotice notice={first} onClose={() => {}} />)
    expect(outside).toHaveFocus()
    unmountAgain()
    render(<NoPositionNotice notice={second} onClose={() => {}} />)
    expect(status()).toHaveFocus()
    outside.remove()
  })

  it('has no aria-label (the text is the name: no double announcement) and a forced-colors-safe outline instead of a ring', () => {
    render(<NoPositionNotice notice={notice} onClose={() => {}} />)
    expect(status()).not.toHaveAttribute('aria-label')
    expect(status()).not.toHaveAttribute('aria-labelledby')
    expect(status().className).toMatch(/focus-visible:outline-2/)
    expect(status().className).toMatch(/focus-visible:outline-primary-text/)
    expect(status().className).not.toMatch(/ring/)
    expect(status().className).not.toMatch(/outline-none/)
  })

  it('closes through its button', () => {
    const onClose = vi.fn()
    render(<NoPositionNotice notice={notice} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij komunikat' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
