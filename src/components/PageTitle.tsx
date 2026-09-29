import type { ReactNode } from 'react'

/**
 * Jedyny krój tytułu strony/karty (24 px, extrabold). `h1` na stronie jest
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
  return <Tag className={`font-heading text-2xl font-extrabold tracking-tight text-foreground ${className}`}>{children}</Tag>
}
