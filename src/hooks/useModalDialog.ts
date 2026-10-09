import { useEffect, useEffectEvent, useRef, type DialogHTMLAttributes, type RefObject } from 'react'

type DialogHandlers = Required<Pick<DialogHTMLAttributes<HTMLDialogElement>, 'onCancel' | 'onClose' | 'onPointerDown' | 'onClick'>>

/**
 * Natywny modalny `<dialog>` (`showModal`: `inert` tła, pułapka fokusu) z zamykaniem, które nie zależy
 * od zdarzenia `close` — wbudowana przeglądarka aplikacji Claude go nie wysłała (2026-10-09,
 * `adr/0009-modalne-info.md`). Escape (`cancel`, domyślne zachowanie zablokowane), tło i `closeOnClick`
 * wołają `onClose` wprost; `close` zostaje zapasem dla zamknięcia bez `cancel` (Escape bez aktywacji
 * użytkownika). Rodzic musi tolerować powtórne `onClose`.
 *
 * Dwa tryby: komponent zawsze zamontowany przełącza `open` (`SearchDialog`; `open=false` → `close()`,
 * fokus oddaje przeglądarka), albo montowany tylko otwarty (`InfoSheet`; domyślne `open=true`).
 * Odmontowanie otwartego dialogu omija `close()`, więc fokus wraca do elementu sprzed otwarcia ręcznie.
 *
 * `onOpen` — po każdym otwarciu (fokus startowy). `requireBackdropPress` — tło zamyka tylko, gdy
 * wciśnięcie też zaczęło się na tle (przeciągnięcie z treści na tło daje klik na `<dialog>`, wspólnym przodku).
 * `ref` i `dialogProps` idą na `<dialog>`.
 */
export function useModalDialog({
  open = true,
  onClose,
  onOpen,
  requireBackdropPress = true,
  closeOnClick,
}: {
  open?: boolean
  onClose: () => void
  onOpen?: (dialog: HTMLDialogElement) => void
  requireBackdropPress?: boolean
  closeOnClick?: (target: Element) => boolean
}): { ref: RefObject<HTMLDialogElement | null>; dialogProps: DialogHandlers } {
  const ref = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const pressedBackdropRef = useRef(false)
  const opened = useEffectEvent((dialog: HTMLDialogElement) => onOpen?.(dialog))

  // Przed efektem otwarcia: w StrictMode symulowane odmontowanie oddaje fokus, a ponowny przebieg
  // efektu otwarcia ustawia go znowu w dialogu.
  useEffect(
    () => () => {
      // Zamknięcie = odmontowanie bez `close()`, więc natywny zwrot fokusu nie zadziała — oddajemy go sami.
      const opener = openerRef.current
      if (opener !== null && opener.isConnected) opener.focus({ preventScroll: true })
    },
    []
  )

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open) {
      // Raz na otwarcie: drugi przebieg efektu (StrictMode) widziałby już fokus w dialogu.
      openerRef.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (!dialog.open) dialog.showModal()
      opened(dialog)
    } else {
      openerRef.current = null
      if (dialog.open) dialog.close()
    }
  }, [open])

  return {
    ref,
    dialogProps: {
      onCancel: (event) => {
        event.preventDefault()
        onClose()
      },
      onClose,
      onPointerDown: (event) => {
        pressedBackdropRef.current = event.target === event.currentTarget
      },
      onClick: (event) => {
        const target = event.target as Element
        // Tło (`::backdrop`) zgłasza klik na samym `<dialog>`.
        const backdrop = target === event.currentTarget && (!requireBackdropPress || pressedBackdropRef.current)
        if (backdrop || closeOnClick?.(target) === true) onClose()
      },
    },
  }
}
