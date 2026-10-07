'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isIos, readInstallDismissed, writeInstallDismissed } from '@/lib/installHint'

/** Zdarzenie Chromium (Android, desktop); brak w Safari/Firefox, więc nie ma go w `lib.dom`. */
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }

/** `native` = systemowe okno instalacji (Chromium), `ios` = ręczna instrukcja, `null` = nic nie pokazujemy. */
export type InstallMode = 'native' | 'ios' | null

// Chromium potrafi wysłać `beforeinstallprompt` zanim React zhydruje i uruchomi efekt — zdarzenie nie jest
// ponawiane, więc łapiemy je od załadowania modułu i oddajemy hookowi.
let earlyPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    earlyPrompt = event as BeforeInstallPromptEvent
  })
}

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
    earlyPrompt = null
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
    if (earlyPrompt !== null) {
      deferred.current = earlyPrompt
      setMode('native')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', dismiss)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', dismiss)
    }
  }, [dismiss])

  const install = useCallback(async () => {
    const event = deferred.current
    if (event === null) return
    deferred.current = null // zdarzenie jest jednorazowe
    try {
      await event.prompt()
      // Zaakceptowane → też `appinstalled`; odrzucone → nie nagabujemy ponownie.
      dismiss()
    } catch {
      // `prompt()` odrzucone (zdarzenie zużyte): bez zapamiętywania — przy następnym zdarzeniu przycisk wróci.
      setMode(null)
    }
  }, [dismiss])

  return { mode, install, dismiss }
}
