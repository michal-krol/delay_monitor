'use client'

import { useId, useRef, useState } from 'react'
import { ListIcon, MoreIcon, ShareIcon, ICON_SIZE } from '../icons'
import { useDismiss } from '@/hooks/useDismiss'

const rowClass = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10'

/** Telefon: „Lista” i „Udostępnij” schowane pod „Więcej”, żeby kontrolki mapy zmieściły się w dwóch rzędach. */
export function MapMoreMenu({ listOpen, onToggleList, onShare }: { listOpen: boolean; onToggleList: () => void; onShare: () => void }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useDismiss(open, rootRef, (byEscape) => {
    setOpen(false)
    if (byEscape) buttonRef.current?.focus()
  })

  function choose(action: () => void): void {
    setOpen(false)
    action()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Więcej"
        onClick={() => setOpen((o) => !o)}
        className="glass grid h-full min-h-11 w-11 place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <MoreIcon size={ICON_SIZE.button} />
      </button>
      {open && (
        <ul id={menuId} aria-label="Więcej" className="glass-strong absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
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
