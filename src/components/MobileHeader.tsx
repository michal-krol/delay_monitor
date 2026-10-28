'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { AppLogo, ArrowLeftIcon, ICON_SIZE } from './icons'
import { IconButton, ICON_BUTTON_CLASS } from './IconButton'
import { useContextTitle } from './headerTitle'
import { useHeaderWeatherContext, usePageHeaderContext, useHeaderDataContext } from './pageHeader'
import { PageMoreMenu } from './PageMoreMenu'
import { WeatherChip } from './WeatherChip'
import { NAV_BACK_TYPES } from '@/lib/navTransition'
import { HeaderData } from './HeaderData'
import { HeaderMapShortcut } from './HeaderMapShortcut'

/**
 * Nagłówek telefonu (poniżej `sm`): powrót, tytuł, pogoda i opcje strony. Nawigacja i jedyna akcja „Szukaj" są w dolnym
 * pasku (`BottomNav`). Pomiar wysokości zasila `--header-h`, także przy powiększonym tekście i safe area.
 */
export function MobileHeader() {
  const contextTitle = useContextTitle()
  const page = usePageHeaderContext()
  const weather = useHeaderWeatherContext()
  const sources = useHeaderDataContext()
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const header = headerRef.current
    if (header === null || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const height = header.getBoundingClientRect().height
      if (height > 0) document.documentElement.style.setProperty('--header-h', `${height}px`)
      else document.documentElement.style.removeProperty('--header-h')
    }
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    measure()
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--header-h') }
  }, [])
  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b bg-surface px-(--page-gutter) pb-2 sm:hidden"
      style={{
        // Kotwica: pasek stoi w miejscu podczas przesunięcia treści (`globals.css`, „View transitions”).
        viewTransitionName: 'site-header',
        paddingTop: 'calc(0.5rem + env(safe-area-inset-top))',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {page?.backHref !== undefined ? (
        <Link href={page.backHref} transitionTypes={NAV_BACK_TYPES} aria-label={page.backLabel} className={`${ICON_BUTTON_CLASS} h-[44px] w-[44px] shrink-0`}><ArrowLeftIcon size={ICON_SIZE.button} /></Link>
      ) : page?.onBack !== undefined ? (
        <IconButton label={page.backLabel ?? 'Wróć'} onClick={page.onBack} size="lg" className="h-[44px] w-[44px] shrink-0"><ArrowLeftIcon size={ICON_SIZE.button} /></IconButton>
      ) : null}
      {page !== null ? <span className="min-w-[min(10ch,100%)] flex-1 text-sm font-bold leading-snug break-words">{contextTitle ?? page.title}</span> : <Link href="/" className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
        <AppLogo size={28} />
        {/* Nazwa aplikacji i (przy tablicy) nazwa tablicy w jednej komórce siatki: przy przewijaniu jedna płynnie
            ustępuje drugiej (CSS scroll-driven, `globals.css`), bez zmiany układu. Kopia nazwy tablicy jest
            `aria-hidden` — nazwę niesie `h1` strony. */}
        <span className="header-titles grid min-w-0" data-context={contextTitle !== null ? '' : undefined}>
          <span data-testid="header-app-title" className="header-title-app font-heading truncate text-[15px] font-bold [grid-area:1/1]">Monitor opóźnień</span>
          {contextTitle !== null && (
            <span aria-hidden="true" data-testid="header-context-title" className="header-title-context font-heading truncate text-[15px] font-bold [grid-area:1/1]">
              {contextTitle}
            </span>
          )}
        </span>
      </Link>}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <HeaderMapShortcut />
        <WeatherChip weather={weather?.weather ?? { status: 'unavailable' }} locationName={weather?.name ?? ''} />
        <PageMoreMenu share={page?.share} />
      </div>
      {sources.length > 0 && <div className="flex w-full justify-end"><HeaderData /></div>}
    </header>
  )
}
