'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isIos, readInstallDismissed, writeInstallDismissed } from '@/lib/installHint'

/** Zdarzenie Chromium (Android, desktop); brak w Safari/Firefox, więc nie ma go w `lib.dom`. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }

/** `native` = systemowe okno instalacji (Chromium), `ios` = ręczna instrukcja, `null` = nic nie pokazujemy. */
export type InstallMode = 'native' | 'ios' | null

function isStandalone(): boolean {
  // `?.`: jsdom (testy powłoki) nie ma `matchMedia`.
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Podpowiedź „Zainstaluj aplikację": tylko poza trybem aplikacji i tylko dopóki jej nie zamknięto
 * (zamknięcie i instalacja zapamiętane w `localStorage` przez schemat, `lib/installHint.ts`).
 */
export function useInstallPrompt() {
  const [mode, setMode] = useState<InstallMode>(null)
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)

  const dismiss = useCallback(() => {
    writeInstallDismissed(window.localStorage, Date.now())
    deferred.current = null
    setMode(null)
  }, [])

  useEffect(() => {
    // Odczyty `window`/storage dopiero w efekcie — na serwerze i w hydracji nic nie jest widoczne (brak rozjazdu).
    if (isStandalone() || readInstallDismissed(window.localStorage)) return
    if (isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode('ios')
      return
    }
    function onPrompt(event: Event): void {
      event.preventDefault() // własny przycisk zamiast mini-paska przeglądarki
      deferred.current = event as BeforeInstallPromptEvent
      setMode('native')
    }
    function onInstalled(): void {
      writeInstallDismissed(window.localStorage, Date.now())
      deferred.current = null
      setMode(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    const event = deferred.current
    if (event === null) return
    deferred.current = null // zdarzenie jest jednorazowe
    try {
      await event.prompt()
    } finally {
      // Zaakceptowane → `appinstalled`; odrzucone → też nie nagabujemy ponownie.
      dismiss()
    }
  }, [dismiss])

  return { mode, install, dismiss }
}
