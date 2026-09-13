import Link from 'next/link'

export type BreadcrumbItem = { label: string; href?: string }

/**
 * Ścieżka nawigacji nad `TopBar` dla widoków głębszych niż jeden poziom
 * (miasto → linia, miasto → przystanek). Ostatni element to zawsze bieżąca
 * strona — bez linku, `aria-current="page"`. Wcześniejsze elementy bez
 * `href` (np. dane jeszcze się wczytują) renderują się jako zwykły tekst.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const lastIndex = items.length - 1
  return (
    <nav aria-label="Ścieżka nawigacji" className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
      {items.map((item, index) => {
        const isCurrent = index === lastIndex
        return (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">/</span>}
            {!isCurrent && item.href !== undefined ? (
              <Link href={item.href} className="transition hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isCurrent ? 'page' : undefined} className={isCurrent ? 'font-medium text-foreground' : undefined}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
