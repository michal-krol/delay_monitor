import { z } from 'zod'

/** Klucz zapamiętanego zamknięcia podpowiedzi instalacji (raz zamknięta albo zainstalowana — nie wraca). */
export const INSTALL_DISMISSED_KEY = 'pkp.installDismissed.v1'
const dismissedSchema = z.object({ dismissedAt: z.number().int().nonnegative() })

/** `localStorage` jest wejściem z zewnątrz (AGENTS.md #4): zły kształt = „nie zamknięta", nigdy wyjątek. */
export function readInstallDismissed(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const raw = storage.getItem(INSTALL_DISMISSED_KEY)
    if (raw === null) return false
    return dismissedSchema.safeParse(JSON.parse(raw)).success
  } catch {
    return false
  }
}

export function writeInstallDismissed(storage: Pick<Storage, 'setItem'>, now: number): void {
  try {
    storage.setItem(INSTALL_DISMISSED_KEY, JSON.stringify({ dismissedAt: now }))
  } catch {
    // Zablokowany/pełny storage — podpowiedź zniknie do końca wizyty, tylko się nie zapamięta.
  }
}

/**
 * iOS/iPadOS nie ma `beforeinstallprompt`: instalacja to ręcznie „Udostępnij → Do ekranu początkowego".
 * iPadOS podaje się za Maca (`MacIntel`), ale ma ekran dotykowy.
 */
export function isIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}
