'use client'

import { useEffect, useRef, useState } from 'react'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useDropdown } from '@/hooks/useDropdown'
import { useShareUrl } from '@/hooks/useShareUrl'
import { DataSources } from './DataSources'
import { ICON_BUTTON_CLASS } from './IconButton'
import { InfoSheet } from './InfoSheet'
import { InfoIcon, MoreIcon, ShareIcon, ICON_SIZE } from './icons'
import { ShareStatusMessage } from './ShareButton'
import { ThemeToggle } from './ThemeToggle'

export function PageMoreMenu({ share = false }: { share?: boolean }) {
  const { open, toggle, close, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const { share: shareUrl, status } = useShareUrl()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const wide = useMediaQuery(SM_UP, true)
  const previousWidth = useRef(wide)
  useEffect(() => {
    if (previousWidth.current === wide) return
    previousWidth.current = wide
    if (!open && !sourcesOpen) return
    close()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss the old viewport's modal before restoring focus to the visible chrome
    setSourcesOpen(false)
    requestAnimationFrame(() => {
      [...document.querySelectorAll<HTMLButtonElement>('[data-page-options-trigger]')].find((element) => element.getClientRects().length > 0)?.focus({ preventScroll: true })
    })
  }, [wide, open, sourcesOpen, close])
  const row = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-primary-text'
  return (
    <div ref={rootRef} className="relative">
      <ShareStatusMessage status={status} className="absolute top-full right-0 z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-surface-border bg-surface p-3 text-sm text-text-secondary break-words shadow-lg" />
      <button data-page-options-trigger ref={buttonRef} type="button" aria-label="Więcej opcji strony" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={toggle} className={`${ICON_BUTTON_CLASS} h-[44px] w-[44px]`}>
        <MoreIcon size={ICON_SIZE.button} />
      </button>
      {open && (
        <ul id={panelId} aria-label="Więcej" className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-surface-border bg-surface p-2 shadow-xl">
          <li className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm text-text-secondary"><span>Motyw</span><ThemeToggle /></li>
          {share && <li><button type="button" className={row} onClick={() => { close({ focusTrigger: true }); void shareUrl() }}><ShareIcon size={ICON_SIZE.button} />Udostępnij</button></li>}
          <li><button type="button" className={row} aria-haspopup="dialog" onClick={() => { close({ focusTrigger: true }); setSourcesOpen(true) }}><InfoIcon size={ICON_SIZE.button} />Źródła danych</button></li>
        </ul>
      )}
      {sourcesOpen && <InfoSheet title="Źródła danych" closeLabel="Zamknij źródła danych" onClose={() => setSourcesOpen(false)}><DataSources /></InfoSheet>}
    </div>
  )
}
