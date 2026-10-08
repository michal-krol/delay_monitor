import type { ReactNode } from 'react'
import { PageTitle } from './PageTitle'
import { PlaceTitle } from './PlaceTitle'

/**
 * Nagłówek tablicy stacji/przystanku. Osadzona tablica (ekran miasta) ma `h1` w `TopBar` i nie przychodzi
 * z Pulpitu, więc dostaje `h2` bez nazwy przejścia; samodzielna — `h1` jako element przejścia z kafelka.
 */
export function BoardHeading({ embedded, kind, id, children, className = 'max-sm:text-xl' }: { embedded: boolean; kind: 'pkp' | 'gtfs'; id: string; children: ReactNode; className?: string }) {
  const title = (
    <PageTitle as={embedded ? 'h2' : 'h1'} className={className}>
      {children}
    </PageTitle>
  )
  return embedded ? title : <PlaceTitle kind={kind} id={id}>{title}</PlaceTitle>
}
