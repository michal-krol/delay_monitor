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
export function useShareUrl() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [copied])

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
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Schowek bywa zablokowany (brak uprawnienia, kontekst bez HTTPS).
      // Przycisk po prostu nie potwierdza — nie udajemy, że się udało.
      setCopied(false)
    }
  }

  return { share, copied }
}
