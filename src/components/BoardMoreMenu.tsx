'use client'

import { useDropdown } from '@/hooks/useDropdown'
import { useShareUrl } from '@/hooks/useShareUrl'
import { InfoIcon, MoreIcon, ShareIcon, ICON_SIZE } from './icons'
import { ICON_BUTTON_CLASS } from './IconButton'
import { rowClass } from './map/MapPanels'

/** Telefon: „Udostępnij” i wejście do arkusza „Info” pod „Więcej” w górnym rzędzie tablicy (← nazwa ★ ⋮). */
export function BoardMoreMenu({ infoLabel, onInfo }: { infoLabel: string; onInfo: () => void }) {
  const { open, toggle, close, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const { share, status } = useShareUrl()

  function choose(action: () => void): void {
    // Pozycja znika razem z menu — fokus wraca na „Więcej” (i tam wraca po zamknięciu arkusza).
    close({ focusTrigger: true })
    action()
  }

  return (
    <div ref={rootRef}>
      {status !== 'idle' && (
        // Pod kartą (jej `relative`), jak w `ShareButton` — długi komunikat nie poszerza rzędu na 375 px.
        <span role="status" className="absolute top-full right-0 mt-1 max-w-full text-right text-sm text-text-secondary">
          {status === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
        </span>
      )}
      <div className="relative">
        <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={panelId} aria-label="Więcej" onClick={toggle} className={`${ICON_BUTTON_CLASS} h-11 w-11`}>
          <MoreIcon size={ICON_SIZE.button} />
        </button>
        {open && (
          <ul id={panelId} aria-label="Więcej" className="glass-chrome-strong border border-surface-border enter-pop absolute right-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
            <li>
              <button type="button" onClick={() => choose(() => void share())} className={rowClass}>
                <ShareIcon size={ICON_SIZE.button} />
                Udostępnij
              </button>
            </li>
            <li>
              <button type="button" aria-haspopup="dialog" onClick={() => choose(onInfo)} className={rowClass}>
                <InfoIcon size={ICON_SIZE.button} />
                {infoLabel}
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
