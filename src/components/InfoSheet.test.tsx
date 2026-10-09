// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubDialogMethods } from '@/test-utils/dialog'
import { InfoSheet, InfoSection } from './InfoSheet'

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
  })

  it('× calls onClose directly — no dependence on the native `close` event (the parent unmounts the sheet)', () => {
    const onClose = mountSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij informacje' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialogStubs.close).not.toHaveBeenCalled()
  })

  it('Escape (native `cancel`) is taken over: default prevented, onClose called', () => {
    const onClose = mountSheet()
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a tap on the backdrop (the <dialog> itself) closes; a tap inside the content does not', () => {
    const onClose = mountSheet()
    fireEvent.click(screen.getByText('Pogoda'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the opener when unmounted', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(
      <InfoSheet title="Informacje o stacji" onClose={vi.fn()}>
        <p>Pogoda</p>
      </InfoSheet>
    )
    expect(opener).not.toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
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
    // eslint-disable-next-line testing-library/no-node-access -- `<details>` nie ma roli w jsdom
    const details = screen.getByText('Mapa').closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('Mapa MapLibre')).toBeInTheDocument()
  })
})
