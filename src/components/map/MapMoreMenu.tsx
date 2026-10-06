'use client'

import { ListIcon, MoreIcon, ShareIcon, ICON_SIZE } from '../icons'
import { useDropdown } from '@/hooks/useDropdown'
import { rowClass } from './MapPanels'

/** Telefon: „Lista” i „Udostępnij” schowane pod „Więcej”, żeby kontrolki mapy zmieściły się w dwóch rzędach. */
export function MapMoreMenu({ listOpen, onToggleList, onShare }: { listOpen: boolean; onToggleList: () => void; onShare: () => void }) {
  const { open, toggle, close, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })

  function choose(action: () => void): void {
    // Panel „Lista” przejmie fokus z „Więcej” i potem go tu odda.
    close({ focusTrigger: true })
    action()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Więcej"
        onClick={toggle}
        className="glass-chrome border border-surface-border shadow-md grid h-full min-h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <MoreIcon size={ICON_SIZE.button} />
      </button>
      {open && (
        <ul id={panelId} aria-label="Więcej" className="glass-chrome-strong border border-surface-border absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
          <li>
            <button type="button" aria-pressed={listOpen} onClick={() => choose(onToggleList)} className={rowClass}>
              <ListIcon size={ICON_SIZE.button} />
              Lista
            </button>
          </li>
          <li>
            <button type="button" onClick={() => choose(onShare)} className={rowClass}>
              <ShareIcon size={ICON_SIZE.button} />
              Udostępnij widok
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
