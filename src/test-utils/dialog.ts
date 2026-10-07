import { vi } from 'vitest'

/**
 * jsdom nie ma `HTMLDialogElement.prototype.showModal/close`. Atrapy zachowują się jak natywne:
 * `showModal` ustawia `open`, `close` zdejmuje je i (tylko jeśli dialog był otwarty) wysyła `close`.
 */
export function stubDialogMethods() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
  return { showModal, close }
}
