import Link from 'next/link'
import { NAV_BACK_TYPES } from '@/lib/navTransition'

export type BreadcrumbItem = { label: string; href?: string }

/**
 * Ścieżka nawigacji w `TopBar` (obok przycisku ←) dla widoków głębszych niż jeden poziom
 * (miasto → linia, miasto → przystanek). Ostatni element to zawsze bieżąca
 * strona — bez linku, `aria-current="page"`. Wcześniejsze elementy bez
 * `href` (np. dane jeszcze się wczytują) renderują się jako zwykły tekst.
 *
 * Poniżej `sm` widać tylko bieżącą stronę, w jednym wierszu z wielokropkiem: obok ← i dwóch
 * przycisków „Pulpit / Warszawa Centralna” łamało się na 3 wiersze, a ← i tak prowadzi do rodzica.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const lastIndex = items.length - 1
  return (
    <nav aria-label="Ścieżka nawigacji" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-text-muted">
      {items.map((item, index) => {
        const isCurrent = index === lastIndex
        return (
          <span key={index} className={`${isCurrent ? 'flex' : 'hidden sm:flex'} min-w-0 items-center gap-1.5`}>
            {index > 0 && (
              <span aria-hidden="true" className="hidden sm:inline">
                /
              </span>
            )}
            {!isCurrent && item.href !== undefined ? (
              <Link href={item.href} transitionTypes={NAV_BACK_TYPES} className="transition hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isCurrent ? 'page' : undefined}
                title={isCurrent ? item.label : undefined}
                className={isCurrent ? 'min-w-0 truncate font-medium text-foreground' : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
