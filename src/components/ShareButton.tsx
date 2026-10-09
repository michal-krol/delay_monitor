'use client'

import { useShareUrl, type ShareStatus } from '@/hooks/useShareUrl'
import { ShareIcon, ICON_SIZE } from './icons'

/** Komunikat po „Udostępnij” — jeden dla `ShareButton` i menu „Więcej” (`BoardMoreMenu`). */
export function ShareStatusMessage({ status }: { status: ShareStatus }) {
  if (status === 'idle') return null
  return (
    // Pod rzędem `TopBar` / kartą stacji (ich `relative`), nie w grupie `shrink-0` obok przycisków —
    // na 375 px długi komunikat poszerzałby wiersz. `role="status"` zostaje, więc jest zapowiadany.
    <span role="status" className="absolute top-full right-0 mt-1 max-w-full text-right text-sm text-text-secondary">
      {status === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
    </span>
  )
}

/**
 * Jeden przycisk „Udostępnij” w całej appce (pasek górny stron szczegółowych
 * i ekranu miasta z wyborem; na telefonie stacja ma go w menu „Więcej”, `BoardMoreMenu`). Z podpisem, nie sama ikona —
 * to główna akcja nagłówka, a „Udostępnij” bez etykiety było najmniej odgadywalne.
 */
export function ShareButton() {
  const { share, status } = useShareUrl()
  return (
    <>
      <ShareStatusMessage status={status} />
      <button
        type="button"
        onClick={() => void share()}
        className="touch-44 relative inline-flex h-9 items-center gap-2 rounded-full border border-surface-border px-3 text-sm font-medium text-text-secondary transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10"
      >
        <ShareIcon size={ICON_SIZE.button} />
        Udostępnij
      </button>
    </>
  )
}
