// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubDialogMethods } from '@/test-utils/dialog'
import { useModalDialog } from './useModalDialog'

let dialogStubs: ReturnType<typeof stubDialogMethods>

beforeEach(() => {
  dialogStubs = stubDialogMethods()
})

function Harness({ open, onClose, onOpen, requireBackdropPress, closeOnClick }: Parameters<typeof useModalDialog>[0]) {
  const { ref, dialogProps } = useModalDialog({ open, onClose, onOpen, requireBackdropPress, closeOnClick })
  return (
    <dialog ref={ref} aria-label="Okno" {...dialogProps}>
      <p>Treść</p>
      <a href="#x">Link</a>
    </dialog>
  )
}

describe('useModalDialog — mounted only while open (InfoSheet)', () => {
  it('opens with showModal on mount and calls onOpen with the dialog', () => {
    const onOpen = vi.fn()
    render(<Harness onClose={vi.fn()} onOpen={onOpen} />)
    expect(dialogStubs.showModal).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(screen.getByRole('dialog'))
  })

  it('Escape (native `cancel`) is taken over: default prevented, onClose called', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a native close that skipped `cancel` (no user activation) still reaches onClose', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a drag that starts in the content and ends on the backdrop does not close', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByText('Treść'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a tap on the backdrop (the <dialog> itself) closes; a tap inside the content does not', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByText('Treść'))
    fireEvent.click(screen.getByText('Treść'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('returns focus to the opener when unmounted (no `close()`, so no native focus return)', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    // eslint-disable-next-line testing-library/no-node-access -- `onOpen` dostaje element dialogu, jak w komponentach
    const { unmount } = render(<Harness onClose={vi.fn()} onOpen={(dialog) => dialog.querySelector('a')?.focus()} />)
    expect(opener).not.toHaveFocus()
    unmount()
    expect(dialogStubs.close).not.toHaveBeenCalled()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})

describe('useModalDialog — always mounted, toggled by `open` (SearchDialog)', () => {
  it('stays closed while `open` is false', () => {
    const onOpen = vi.fn()
    render(<Harness open={false} onClose={vi.fn()} onOpen={onOpen} />)
    expect(dialogStubs.showModal).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows on `open`, closes natively when `open` turns false, shows again on the next `open`', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<Harness open={false} onClose={vi.fn()} onOpen={onOpen} />)
    rerender(<Harness open onClose={vi.fn()} onOpen={onOpen} />)
    expect(dialogStubs.showModal).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
    rerender(<Harness open={false} onClose={vi.fn()} onOpen={onOpen} />)
    expect(dialogStubs.close).toHaveBeenCalledTimes(1)
    rerender(<Harness open onClose={vi.fn()} onOpen={onOpen} />)
    expect(dialogStubs.showModal).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('does not move focus on unmount after a normal close (the browser already returned it)', () => {
    const opener = document.createElement('button')
    const elsewhere = document.createElement('button')
    document.body.append(opener, elsewhere)
    opener.focus()
    const { rerender, unmount } = render(<Harness open onClose={vi.fn()} />)
    rerender(<Harness open={false} onClose={vi.fn()} />)
    elsewhere.focus()
    unmount()
    expect(elsewhere).toHaveFocus()
    opener.remove()
    elsewhere.remove()
  })

  it('requireBackdropPress=false: a click on the backdrop closes without a press on it', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} requireBackdropPress={false} />)
    fireEvent.pointerDown(screen.getByText('Treść'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closeOnClick closes on matching clicks inside the content only', () => {
    const onClose = vi.fn()
    // eslint-disable-next-line testing-library/no-node-access -- predykat jak w `SearchDialog`, nie zapytanie testu
    render(<Harness open onClose={onClose} closeOnClick={(target) => target.closest('a') !== null} />)
    fireEvent.click(screen.getByText('Treść'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Link' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
