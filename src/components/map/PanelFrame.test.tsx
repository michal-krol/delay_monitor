// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PanelFrame } from './PanelFrame'

describe('PanelFrame', () => {
  it('is a non-modal dialog labelled by its heading, with a body region', () => {
    render(
      <PanelFrame title="W pobliżu" closeLabel="Zamknij panel" onClose={vi.fn()} bodyLabel="Lista">
        treść
      </PanelFrame>,
    )
    const dialog = screen.getByRole('dialog', { name: 'W pobliżu' })
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    expect(screen.getByLabelText('Lista')).toHaveTextContent('treść')
  })

  it('focuses the heading on mount and again when focusKey changes', () => {
    const { rerender } = render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={vi.fn()} focusKey="a">
        x
      </PanelFrame>,
    )
    expect(screen.getByRole('heading', { name: 'A' })).toHaveFocus()
    screen.getByRole('button', { name: 'Zamknij' }).focus()
    rerender(
      <PanelFrame title="B" closeLabel="Zamknij" onClose={vi.fn()} focusKey="b">
        x
      </PanelFrame>,
    )
    expect(screen.getByRole('heading', { name: 'B' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the element that opened it', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
        x
      </PanelFrame>,
    )
    expect(trigger).not.toHaveFocus()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('calls the latest onClose after a rerender', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={first}>
        x
      </PanelFrame>,
    )
    rerender(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={second}>
        x
      </PanelFrame>,
    )
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('does not close when an inner handler already consumed Escape (defaultPrevented)', () => {
    const onClose = vi.fn()
    render(
      <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
        x
      </PanelFrame>,
    )
    // Listener rejestrowany później niż ramka (jak otwarta lista rozwijana) — ramka i tak ma go zobaczyć.
    const inner = (event: KeyboardEvent): void => event.preventDefault()
    document.addEventListener('keydown', inner)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.removeEventListener('keydown', inner)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders leading content and extra actions before the close button, which calls onClose', async () => {
    const onClose = vi.fn()
    render(
      <PanelFrame title="Linia 20" leading={<span>badge</span>} actions={<button type="button">Przypnij</button>} closeLabel="Zamknij" onClose={onClose}>
        x
      </PanelFrame>,
    )
    expect(screen.getByText('badge')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(buttons).toEqual(['Przypnij', 'Zamknij'])
    await userEvent.click(screen.getByRole('button', { name: 'Zamknij' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
