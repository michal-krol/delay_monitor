'use client'

import { useShareUrl } from '@/hooks/useShareUrl'
import { ShareIcon, ICON_SIZE } from './icons'

/**
 * Jeden przycisk „Udostępnij” w całej appce (pasek górny stron szczegółowych
 * i ekranu miasta z wyborem; karta stacji na telefonie — `iconOnly`). Domyślnie z podpisem, nie sama ikona — to główna
 * akcja nagłówka, a „Udostępnij” bez etykiety było najmniej odgadywalne.
 */
export function ShareButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { share, status } = useShareUrl()
  return (
    <>
      {status !== 'idle' && (
        // Pod rzędem `TopBar` (jego `relative`), nie w grupie `shrink-0` obok przycisków —
        // na 375 px długi komunikat poszerzałby wiersz. `role="status"` zostaje, więc jest zapowiadany.
        <span role="status" className="absolute top-full right-0 mt-1 max-w-full text-right text-sm text-text-secondary">
          {status === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
        </span>
      )}
      <button
        type="button"
        onClick={() => void share()}
        aria-label={iconOnly ? 'Udostępnij' : undefined}
        className={`touch-44 relative inline-flex items-center rounded-full border border-surface-border text-sm font-medium text-text-secondary transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10 ${iconOnly ? 'h-11 w-11 justify-center' : 'h-9 gap-2 px-3'}`}
      >
        <ShareIcon size={ICON_SIZE.button} />
        {!iconOnly && 'Udostępnij'}
      </button>
    </>
  )
}
