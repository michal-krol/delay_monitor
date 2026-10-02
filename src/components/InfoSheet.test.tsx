// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InfoSheet } from './InfoSheet'

beforeEach(() => {
  window.HTMLElement.prototype.scrollTo = () => {}
})

describe('InfoSheet', () => {
  it('is a non-modal dialog named by its title, opening at half, closed by ×', () => {
    const onClose = vi.fn()
    render(
      <InfoSheet title="Informacje o stacji" onClose={onClose}>
        <p>Pogoda</p>
      </InfoSheet>
    )
    const dialog = screen.getByRole('dialog', { name: 'Informacje o stacji' })
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    expect(screen.getByText('Pogoda')).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access -- kontener przewijania nie ma roli
    expect(document.querySelector('.bottom-sheet')).toHaveAttribute('data-snap', 'half')

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij informacje' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape (PanelFrame owns the dialog semantics, not the sheet)', () => {
    const onClose = vi.fn()
    render(
      <InfoSheet title="Informacje o stacji" onClose={onClose}>
        <p>Pogoda</p>
      </InfoSheet>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
