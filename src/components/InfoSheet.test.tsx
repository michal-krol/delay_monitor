// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubDialogMethods } from '@/test-utils/dialog'
import { InfoButton, InfoSheet, InfoSection } from './InfoSheet'

let dialogStubs: ReturnType<typeof stubDialogMethods>

beforeEach(() => {
  dialogStubs = stubDialogMethods()
})

function mountSheet(onClose = vi.fn()) {
  render(
    <InfoSheet title="Informacje o stacji" onClose={onClose}>
      <p>Pogoda</p>
    </InfoSheet>
  )
  return onClose
}

describe('InfoSheet', () => {
  it('is a native modal <dialog> named by its title, opened with showModal, focus on the heading', () => {
    mountSheet()
    const dialog = screen.getByRole('dialog', { name: 'Informacje o stacji' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialogStubs.showModal).toHaveBeenCalledTimes(1)
    // Natywny modal blokuje tło sam — bez ręcznego `aria-modal` (brief §8).
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(screen.getByRole('heading', { name: 'Informacje o stacji' })).toHaveFocus()
    expect(screen.getByText('Pogoda')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Informacje o stacji' })).not.toBeInTheDocument()
  })

  it('× calls onClose directly — no dependence on the native `close` event (the parent unmounts the sheet)', () => {
    const onClose = mountSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij informacje' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialogStubs.close).not.toHaveBeenCalled()
  })

  it('closes on Escape and on a tap on the backdrop (mechanics: useModalDialog.test.tsx)', () => {
    const onClose = mountSheet()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a drag that starts in the content and ends on the backdrop does not close', () => {
    const onClose = mountSheet()
    fireEvent.pointerDown(screen.getByText('Pogoda'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('InfoSection', () => {
  it('outside the sheet: a plain card with a heading, content always mounted', () => {
    render(
      <InfoSection title="Mapa" collapsible>
        <p>Mapa MapLibre</p>
      </InfoSection>
    )
    expect(screen.getByRole('heading', { name: 'Mapa' })).toBeInTheDocument()
    expect(screen.getByText('Mapa MapLibre')).toBeInTheDocument()
  })

  it('in the sheet: collapsible sections start closed and mount their content only once opened (lazy map)', () => {
    render(
      <InfoSheet title="Informacje o stacji" onClose={vi.fn()}>
        <InfoSection title="Utrudnienia">
          <p>Brak utrudnień</p>
        </InfoSection>
        <InfoSection title="Mapa" collapsible>
          <p>Mapa MapLibre</p>
        </InfoSection>
      </InfoSheet>
    )
    expect(screen.getByText('Brak utrudnień')).toBeInTheDocument()
    expect(screen.queryByText('Mapa MapLibre')).not.toBeInTheDocument()
    // Wzorzec disclosure (WAI): nagłówek zostaje nagłówkiem, w nim przycisk z `aria-expanded`.
    const toggle = within(screen.getByRole('heading', { name: 'Mapa' })).getByRole('button', { name: 'Mapa' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Mapa MapLibre')).toBeVisible()
    // Zwinięcie nie niszczy mapy — ponowne otwarcie nie stawia MapLibre od zera.
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Mapa MapLibre')).not.toBeVisible()
  })
})

describe('InfoButton', () => {
  it('focuses itself on click (Safari does not), so the sheet can return focus to it', () => {
    render(<InfoButton open={false} onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Info' })
    fireEvent.click(button)
    expect(button).toHaveFocus()
  })
})
