import { useEffect, useRef, type RefObject } from 'react'

/**
 * Zamykanie rozwijanego menu/panelu nad mapą: Escape i klik poza `rootRef`. Escape jest
 * „zjadany” (`preventDefault`), więc ramka panelu (`PanelFrame`) zamyka się dopiero drugim
 * Escape — najbardziej wewnętrzny element pierwszy. `close(true)` = przez Escape (wywołujący
 * zwykle oddaje wtedy fokus przyciskowi), `close(false)` = klik poza.
 */
export function useDismiss(open: boolean, rootRef: RefObject<HTMLElement | null>, close: (byEscape: boolean) => void): void {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRef.current(true)
    }
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) closeRef.current(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, rootRef])
}
