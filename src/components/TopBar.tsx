'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, ICON_SIZE } from './icons'
import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb'
import { ICON_BUTTON_CLASS, ICON_BUTTON_MD_SIZE, IconButton } from './IconButton'
import { PageTitle } from './PageTitle'
import { ShareButton } from './ShareButton'
import { ThemeToggle } from './ThemeToggle'

type HeaderVariant = {
  title: string
  subtitle: string
  /** Kontrolki po prawej stronie nagłówka (np. wybór miasta), przed `ThemeToggle`. */
  actions?: ReactNode
  /** Poniżej `sm` jeden niski rząd: tytuł tylko dla czytnika (nazwa jest w dolnym pasku), mniejszy podtytuł. */
  compact?: boolean
  backLabel?: never
  backHref?: never
  onBack?: never
  crumbs?: never
  share?: never
}

/**
 * Strony szczegółowe (stacja, przystanek, linia, połączenie): jeden rząd —
 * po lewej ← i ścieżka, po prawej „Udostępnij” i motyw. Tytuł (h1) jest w
 * karcie treści strony, nie tutaj.
 *
 * Dokąd prowadzi ←: `backHref`, gdy rodzic jest jednoznaczny (link), albo
 * `onBack`, gdy nie jest — `/connection/...` nie zna strony-źródła (mogła to
 * być zakładka Odjazdy albo Przyjazdy pełnej tablicy), więc cofa przez
 * `router.back()` wybrane przez wywołującego. Dokładnie jedno z dwóch.
 */
type BackVariant = {
  /** Nazwa dostępna przycisku ←, np. „Wróć do Pulpitu”. */
  backLabel: string
  /** Ścieżka: rodzic(e) i bieżąca strona (ostatni element = `aria-current`). */
  crumbs: BreadcrumbItem[]
  /** „Udostępnij” obok przełącznika motywu. Pominięte tam, gdzie nie ma sensu wysyłać strony dalej. */
  share?: boolean
  title?: never
  subtitle?: never
  actions?: never
  compact?: never
} & ({ backHref: string; onBack?: never } | { onBack: () => void; backHref?: never })

type Props = HeaderVariant | BackVariant

export function TopBar(props: Props) {
  const back = props.backLabel === undefined ? null : props

  return (
    // Wariant nagłówka zawija rząd (kontrolki schodzą pod tytuł na wąskim ekranie
    // zamiast wychodzić poza stronę); wariant z ← zostaje w jednym rzędzie.
    <div className={`relative flex items-center justify-between gap-4 ${back === null ? (props.compact ? 'flex-nowrap sm:flex-wrap sm:gap-y-2' : 'flex-wrap gap-y-2') : ''}`}>
      {back !== null ? (
        <div className="flex min-w-0 items-center gap-3">
          {back.backHref !== undefined ? (
            <Link href={back.backHref} aria-label={back.backLabel} className={`${ICON_BUTTON_CLASS} ${ICON_BUTTON_MD_SIZE}`}>
              <ArrowLeftIcon size={ICON_SIZE.button} />
            </Link>
          ) : (
            <IconButton label={back.backLabel} onClick={back.onBack}>
              <ArrowLeftIcon size={ICON_SIZE.button} />
            </IconButton>
          )}
          <Breadcrumb items={back.crumbs} />
        </div>
      ) : (
        <div className="min-w-0">
          <PageTitle className={props.compact ? 'max-sm:sr-only' : ''}>{props.title}</PageTitle>
          <p className={`text-text-muted ${props.compact ? 'text-xs sm:mt-0.5 sm:text-sm' : 'mt-0.5 text-sm'}`}>{props.subtitle}</p>
        </div>
      )}

      {/* Z tytułem grupa (Udostępnij + wybór miasta + motyw) może się zawinąć — na 375 px bywa szersza niż
          wiersz i wystawała poza stronę (e2e headings.spec, WebKit na Linuksie). Z „wstecz” skraca się breadcrumb. */}
      <div className={`flex items-center gap-2 ${back === null ? 'ml-auto min-w-0 flex-wrap justify-end' : 'shrink-0'}`}>
        {back === null ? props.actions : back.share === true && <ShareButton />}
        {/* Poniżej `sm` przełącznik motywu jest w `MobileHeader` — jeden na ekran. */}
        <span className="hidden sm:contents">
          <ThemeToggle />
        </span>
      </div>
    </div>
  )
}
