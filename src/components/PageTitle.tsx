import type { ReactNode } from 'react'

/**
 * Jedyny krój tytułu strony/karty (`page-title`: 24/30 px, extrabold). `h1` na stronie jest
 * dokładnie jeden; tytuł osadzony w widoku, który ma już `h1` w `TopBar`
 * (np. tablica stacji na ekranie miasta), dostaje `as="h2"` — ten sam wygląd.
 */
export function PageTitle({
  as: Tag = 'h1',
  children,
  className = '',
}: {
  as?: 'h1' | 'h2'
  children: ReactNode
  className?: string
}) {
  return <Tag className={`page-title text-foreground ${className}`}>{children}</Tag>
}
