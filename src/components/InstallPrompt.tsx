'use client'

import { usePathname } from 'next/navigation'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { CloseIcon, ICON_SIZE, ShareIcon } from './icons'
import { IconButton } from './IconButton'
import { activeItemFromPath } from './navItems'

/**
 * Jednorazowa podpowiedź instalacji PWA (ADR PR2: bez service workera, instalowalność bez offline).
 * Chromium: przycisk wywołuje systemowe okno; iOS: instrukcja „Udostępnij → Do ekranu początkowego".
 * Region `status` jest zawsze w DOM, jak w `OfflineBanner` — czytnik ogłasza wstawioną treść.
 * Nie na widokach mapy: pływałaby nad arkuszem i przechwytywała gesty (e2e `map.spec.ts` na iOS); poczeka na inny ekran.
 */
export function InstallPrompt() {
  const { mode, install, dismiss } = useInstallPrompt()
  const onMap = activeItemFromPath(usePathname()) === 'mapa'
  return (
    <div role="status">
      {mode !== null && !onMap && (
        <div
          data-testid="install-prompt"
          className="glass-chrome-strong border border-surface-border enter-fade fixed left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl py-2 pr-2 pl-4 text-sm shadow-lg sm:right-4 sm:bottom-4 sm:left-auto sm:translate-x-0"
          style={{ bottom: 'calc(var(--bottom-nav-h) + 4rem)' }}
        >
          {mode === 'native' ? (
            <>
              <span className="text-text-secondary">Aplikacja zawsze pod ręką.</span>
              <button
                type="button"
                onClick={() => void install()}
                className="press touch-44 relative inline-flex h-9 items-center rounded-full bg-indigo-600 px-4 font-medium text-white focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Zainstaluj aplikację
              </button>
            </>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 text-text-secondary">
              Zainstaluj aplikację: <ShareIcon size={ICON_SIZE.inline} />
              <strong className="font-medium text-foreground">Udostępnij → Do ekranu początkowego</strong>
            </span>
          )}
          <IconButton label="Zamknij podpowiedź instalacji" onClick={dismiss}>
            <CloseIcon size={ICON_SIZE.button} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
