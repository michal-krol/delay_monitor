import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CloseIcon } from '../icons'
import { IconButton } from '../IconButton'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'

/**
 * Jedna rama dokowanego panelu mapy (spec §15): karta obiektu (`MapCard`),
 * panel linii (`LinePanel`) i panele dodatkowe (`MapPanels`). Niemodalny
 * dialog, fokus wchodzi na nagłówek przy każdym nowym obiekcie (`focusKey`),
 * Escape zamyka, a po zamknięciu fokus wraca tam, skąd przyszedł.
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
  children: ReactNode
}) {
  const headingId = useId()
  const [bodyRef, bodyTabIndex] = useScrollableFocus<HTMLDivElement>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    returnFocusRef.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null
    headingRef.current?.focus({ preventScroll: true })
  }, [focusKey])

  useEffect(() => {
    // `window` (bąbelkowanie po `document`), żeby widzieć `defaultPrevented` z listenerów
    // rejestrowanych później (otwarta lista rozwijana, szuflada nawigacji) — najbardziej
    // wewnętrzny element zamyka się pierwszy, panel dopiero drugim Escape.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Celowo wartość z chwili zamknięcia: wpisuje ją pierwsze przejęcie fokusu.
      const target = returnFocusRef.current
      if (target !== null && target.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

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
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4" tabIndex={bodyTabIndex} aria-label={bodyLabel ?? title}>
        {children}
      </div>
    </section>
  )
}
