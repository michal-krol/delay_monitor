'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircleIcon } from './icons'

/**
 * Ikonka „?" z pływającą legendą — wzorzec wspólny dla legendy statusów na
 * tablicy (`BoardTable.tsx`) i legendy pól w widżecie diagnostyki
 * (`PollerDiagnostics.tsx`). Treść panelu przekazuje wywołujący jako `children`.
 *
 * Prawdziwy stan (`useState`), nie czysty CSS `:hover`: panel istnieje w DOM
 * wyłącznie gdy otwarty, więc jego tekst nie koliduje z zapytaniami `getByText`
 * w testach wierszy tablicy (etykiety w legendzie bywają identyczne z tekstem
 * plakietek).
 *
 * Portal do `<body>` + `position: fixed` liczone z `getBoundingClientRect()`:
 * rodzic (tabela) bywa `overflow-x-auto`, co wg spec. CSS Overflow wymusza
 * `overflow-y: auto` na tym samym elemencie i obcina wszystko, co z niego
 * wystaje przy krótkiej zawartości. Fixed z pomiaru omija to bez zgadywania
 * z-index/stacking.
 */
export function InfoTooltip({
  label,
  children,
  align = 'right',
  width = 'w-64',
}: {
  label: string
  children: ReactNode
  /** Do której krawędzi ikonki dokleić panel. `left` dla wąskiego paska bocznego, gdzie prawy panel wyszedłby poza ekran. */
  align?: 'left' | 'right'
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  function show(): void {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      setPosition(
        align === 'left'
          ? { top: rect.bottom + 4, left: rect.left }
          : { top: rect.bottom + 4, right: window.innerWidth - rect.right }
      )
    }
    setOpen(true)
  }

  return (
    <span
      ref={anchorRef}
      className="relative ml-1 inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      // Escape zamyka podpowiedź bez zabierania focusu z przycisku — zachowanie
      // tooltipa (nie dialogu). Focus zostaje, więc `onFocus` nie otworzy jej
      // z powrotem, dopóki użytkownik nie odejdzie i nie wróci.
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        className="cursor-help text-text-muted"
      >
        <HelpCircleIcon size={13} />
      </button>
      {open &&
        position !== null &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            // Celowo w pełni kryjące (nie `glass` — ta jest zawsze półprzezroczysta
            // z blurem): to pływający panel nad ruchliwą zawartością, musi być
            // czytelny niezależnie od tła pod spodem.
            className={`fixed z-50 ${width} rounded-2xl border border-black/10 bg-white p-3 text-xs text-text-secondary dark:border-white/10 dark:bg-slate-900`}
            style={{
              top: position.top,
              left: position.left,
              right: position.right,
              boxShadow: 'var(--surface-shadow), 0 0 24px rgba(99,102,241,0.28)',
            }}
          >
            {children}
          </span>,
          document.body
        )}
    </span>
  )
}
