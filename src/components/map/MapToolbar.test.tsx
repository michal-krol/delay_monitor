// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveFilterChips, MapToolbar, NoPositionNotice } from './MapToolbar'

describe('MapToolbar', () => {
  it.each([false, true])('keeps search and alerts without transport filters (wide=%s)', async (isWide) => {
    const onAlertsOnly = vi.fn()
    render(<MapToolbar isWide={isWide} search={<input aria-label="Search" />} alertsOnly={false} onAlertsOnly={onAlertsOnly} pinnedPoints={[]} onOpenPinned={vi.fn()} onShare={vi.fn()} />)
    expect(screen.queryByRole('button', {name:'Lista'})).toBeNull()
    expect(screen.queryByRole('group', {name:'Rodzaje pojazdów'})).toBeNull()
    const alerts = screen.getByRole('button', {name:'Z utrudnieniami'})
    expect(alerts).toHaveAttribute('aria-pressed','false')
    fireEvent.click(alerts)
    expect(onAlertsOnly).toHaveBeenCalledWith(true)
    const toggle = screen.getByRole('button', {name:'Szukaj'})
    fireEvent.click(toggle)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.change(input, {target:{value:'Centrum'}})
    fireEvent.keyDown(input, {key:'Escape'})
    expect(toggle).toHaveFocus()
    fireEvent.click(toggle)
    expect(screen.getByRole('textbox')).toHaveValue('Centrum')
  })
})

describe('ActiveFilterChips', () => {
  const base = {
    line: null as { line: string } | null,
    alertsOnly: false,
    onClearLine: vi.fn(),
    onAlertsOnly: vi.fn(),
    onClear: vi.fn(),
  }

  it('renders nothing without restrictions', () => {
    render(<ActiveFilterChips {...base} />)
    expect(screen.queryByRole('list', { name: 'Aktywne filtry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Wyczyść filtry' })).toBeNull()
  })

  it('lists line, alerts and hidden layers and offers „Wyczyść filtry" while the count is above zero', () => {
    const onClear = vi.fn()
    render(<ActiveFilterChips {...base} line={{ line: '175' }} alertsOnly onClear={onClear} />)
    const chips = screen.getByRole('list', { name: 'Aktywne filtry' })
    expect(within(chips).getByText('Linia 175')).toBeInTheDocument()
    expect(within(chips).getByText('Tylko linie z utrudnieniami')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('a single chip removes only its own restriction', () => {
    const onClearLine = vi.fn()
    render(<ActiveFilterChips {...base} line={{ line: '175' }} onClearLine={onClearLine} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż wszystkie linie zamiast linii 175' }))
    expect(onClearLine).toHaveBeenCalledOnce()
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
