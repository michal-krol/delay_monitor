'use client'

import { useShareUrl } from '@/hooks/useShareUrl'
import { ShareIcon } from './icons'

/**
 * Jeden przycisk „Udostępnij” w całej appce (pasek górny stron szczegółowych
 * i ekranu miasta z wyborem). Przycisk z podpisem, nie sama ikona — to główna
 * akcja nagłówka, a „Udostępnij” bez etykiety było najmniej odgadywalne.
 */
export function ShareButton() {
  const { share, status } = useShareUrl()
  return (
    <>
      {status !== 'idle' && (
        <span role="status" className="text-sm text-text-secondary">
          {status === 'copied' ? 'Skopiowano link' : 'Nie udało się skopiować — link w pasku adresu'}
        </span>
      )}
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-surface-border px-3 text-sm font-medium text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <ShareIcon size={15} />
        Udostępnij
      </button>
    </>
  )
}
