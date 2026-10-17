'use client'

import { MoreIcon, ShareIcon, ICON_SIZE } from '../icons'
import { useDropdown } from '@/hooks/useDropdown'
import { rowClass } from './MapPanels'

/** Telefon: „Udostępnij widok” schowane pod „Więcej” (Lista i Filtry mają własne, zawsze widoczne przyciski). */
export function MapMoreMenu({ onShare }: { onShare: () => void }) {
  const { open, toggle, close, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Więcej"
        onClick={toggle}
        className="glass-chrome border border-surface-border shadow-md control-44 grid h-full place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <MoreIcon size={ICON_SIZE.button} />
      </button>
      {open && (
        <ul id={panelId} aria-label="Więcej" className="glass-chrome-strong border border-surface-border enter-pop absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
          <li>
            <button
              type="button"
              onClick={() => {
                // Menu znika razem z wybraną pozycją — fokus wraca na „Więcej”, nie na <body>.
                close({ focusTrigger: true })
                onShare()
              }}
              className={rowClass}
            >
              <ShareIcon size={ICON_SIZE.button} />
              Udostępnij widok
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
