// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDropdown } from './useDropdown'

function Dropdown({ focusTriggerOnEscape }: { focusTriggerOnEscape: boolean }) {
  const { open, toggle, close, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape })
  return (
    <div>
      <div ref={rootRef}>
        <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          Menu
        </button>
        {open && (
          <ul id={panelId} aria-label="Panel">
            <li>
              <button type="button" onClick={() => close()}>
                Zamknij
              </button>
            </li>
            <li>
              <button type="button" onClick={() => close({ focusTrigger: true })}>
                Wybierz
              </button>
            </li>
          </ul>
        )}
      </div>
      <button type="button">Poza</button>
    </div>
  )
}

function setup(focusTriggerOnEscape: boolean) {
  render(<Dropdown focusTriggerOnEscape={focusTriggerOnEscape} />)
  const trigger = screen.getByRole('button', { name: 'Menu' })
  fireEvent.click(trigger)
  return trigger
}

describe('useDropdown', () => {
  it('toggles open and wires aria-controls to the panel', () => {
    const trigger = setup(true)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('list', { name: 'Panel' }).id)
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('consumes Escape and returns focus to the trigger when asked to', () => {
    const trigger = setup(true)
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(false)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('consumes Escape without moving focus when focusTriggerOnEscape is off', () => {
    const trigger = setup(false)
    const outside = screen.getByRole('button', { name: 'Poza' })
    outside.focus()
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(false)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(outside).toHaveFocus()
  })

  it('leaves Escape alone while closed, so the surrounding panel can close', () => {
    render(<Dropdown focusTriggerOnEscape />)
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true)
  })

  it('closes on a pointerdown outside without moving focus, stays open on one inside', () => {
    const trigger = setup(true)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Zamknij' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const outside = screen.getByRole('button', { name: 'Poza' })
    outside.focus()
    fireEvent.pointerDown(outside)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(outside).toHaveFocus()
  })

  it('close() keeps focus where it is, close({ focusTrigger }) moves it to the trigger', () => {
    const trigger = setup(true)
    const item = screen.getByRole('button', { name: 'Zamknij' })
    item.focus()
    fireEvent.click(item)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Wybierz' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
