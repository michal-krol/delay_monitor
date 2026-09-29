import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { CloseIcon } from '../icons'
import { IconButton } from '../IconButton'

/**
 * Jedna rama dokowanego panelu mapy (spec §15): karta obiektu (`MapCard`),
 * panel linii (`LinePanel`) i panele dodatkowe (`MapPanels`). Niemodalny
 * dialog, fokus wchodzi na nagłówek przy każdym nowym obiekcie (`focusKey`).
 */
export function PanelFrame({
  title,
  subtitle,
  leading,
  actions,
  closeLabel,
  onClose,
  bodyLabel,
  focusKey,
  returnFocusRef,
  children,
}: {
  title: string
  /** Tekst albo gotowy element (np. z kropką trybu). */
  subtitle?: ReactNode
  /** Przed nagłówkiem (np. `LineBadge`). */
  leading?: ReactNode
  /** Dodatkowe przyciski przed „×” (np. przypnij). */
  actions?: ReactNode
  closeLabel: string
  onClose: () => void
  /** Nazwa przewijanego obszaru treści; domyślnie `title`. */
  bodyLabel?: string
  focusKey?: string
  /** Dostaje element, który miał fokus przed pierwszym przejęciem — rodzic zwraca mu fokus po zamknięciu. */
  returnFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (returnFocusRef !== undefined) {
      returnFocusRef.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    headingRef.current?.focus({ preventScroll: true })
    // `returnFocusRef` to stabilny ref — celowo poza zależnościami.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  return (
    <section role="dialog" aria-modal="false" aria-labelledby={headingId} className="glass-strong flex max-h-full flex-col overflow-hidden rounded-2xl shadow-xl">
      <header className="flex items-start gap-3 border-b border-surface-border p-4">
        {leading}
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-heading text-lg font-bold leading-tight outline-none first-letter:uppercase">
            {title}
          </h2>
          {typeof subtitle === 'string' ? <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p> : subtitle}
        </div>
        {actions}
        <IconButton label={closeLabel} onClick={onClose} size="lg">
          <CloseIcon size={16} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" tabIndex={0} aria-label={bodyLabel ?? title}>
        {children}
      </div>
    </section>
  )
}
