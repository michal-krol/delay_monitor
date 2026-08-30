'use client'

import { useEffect, useState } from 'react'

/** Jak długo przycisk potwierdza skopiowanie, zanim wróci do etykiety wyjściowej. */
const CONFIRMATION_MS = 2500

/**
 * Udostępnienie adresu bieżącej strony: natywny arkusz systemowy tam, gdzie
 * jest (telefony), schowek wszędzie indziej.
 *
 * Adresy widoków tej aplikacji są kanoniczne i odtwarzalne (np.
 * `/polaczenie/{scheduleId}/{orderId}/{operatingDate}`), więc nie ma czego
 * budować — oddajemy dokładnie to, co jest w pasku adresu.
 *
 * Jedna implementacja dla obu miejsc wywołania (górny pasek i karta
 * „Udostępnij połączenie"), żeby zachowanie nie mogło się między nimi
 * rozjechać.
 */
export type ShareStatus = 'idle' | 'copied' | 'error'

export function useShareUrl() {
  const [status, setStatus] = useState<ShareStatus>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const timer = setTimeout(() => setStatus('idle'), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [status])

  async function share(): Promise<void> {
    const url = window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, url })
      } catch {
        // Anulowanie arkusza udostępniania odrzuca obietnicę — to wybór
        // użytkownika, nie awaria, więc nie pokazujemy żadnego komunikatu.
      }
      return
    }
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API niedostępne')
      await navigator.clipboard.writeText(url)
      setStatus('copied')
    } catch {
      // Schowek bywa zablokowany (brak uprawnienia, kontekst bez HTTPS).
      // Mówimy o tym wprost i kierujemy do paska adresu, zamiast milczeć --
      // cicha porażka wygląda dla użytkownika jak zawieszony przycisk
      // (AGENTS.md #7: awaria nie chowa się pod pustym stanem).
      setStatus('error')
    }
  }

  return { share, status, copied: status === 'copied' }
}
