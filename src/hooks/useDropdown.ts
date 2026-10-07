import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * Rozwijane menu/panel nad mapą: stan `open`, id panelu dla `aria-controls`, `rootRef` (obszar,
 * w którym klik nie zamyka) i `buttonRef` (przycisk, na który wraca fokus). Escape i klik poza
 * `rootRef` zamykają. Escape jest „zjadany” (`preventDefault`), więc ramka panelu (`PanelFrame`)
 * zamyka się dopiero drugim Escape — najbardziej wewnętrzny element pierwszy. Klik poza nigdy
 * nie przesuwa fokusu; Escape oddaje go przyciskowi tylko przy `focusTriggerOnEscape`.
 *
 * Przycisk musi mieć `aria-expanded={open}` — po nim strona mapy podnosi kontrolki nad arkusz
 * (`has-[[aria-expanded=true]]:z-30`).
 */
export function useDropdown({ focusTriggerOnEscape }: { focusTriggerOnEscape: boolean }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const toggle = (): void => setOpen((o) => !o)
  /** `focusTrigger` — po wyborze pozycji, która znika razem z menu (fokus nie spada na `<body>`). */
  const close = useCallback((options?: { focusTrigger?: boolean }) => {
    setOpen(false)
    if (options?.focusTrigger) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close({ focusTrigger: focusTriggerOnEscape })
    }
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close, focusTriggerOnEscape])

  return { open, toggle, close, rootRef, buttonRef, panelId }
}
