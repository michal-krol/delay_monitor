import type { Metadata } from 'next'
import { shareTitle, type ShareCard } from './card'

const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/i

/**
 * Publiczny adres aplikacji, do którego Next dokleja ścieżkę `og:image`. Bez `metadataBase` Next
 * użyłby `http://localhost:PORT` (poza Vercelem) — podgląd linku wskazywałby wtedy na obraz, którego
 * bot nie pobierze. Railway wystawia domenę jako `RAILWAY_PUBLIC_DOMAIN` (osobną dla produkcji i
 * stagingu); lokalnie zmiennej nie ma → `null` i zostaje domyślne zachowanie Next.
 */
export function publicBaseUrl(env: Record<string, string | undefined> = process.env): URL | null {
  const domain = env.RAILWAY_PUBLIC_DOMAIN
  return domain !== undefined && DOMAIN_PATTERN.test(domain) ? new URL(`https://${domain}`) : null
}

/** `generateMetadata` dla segmentów z kartą podglądu; obraz dokłada Next z sąsiedniego `opengraph-image.tsx`. */
export function cardMetadata(card: ShareCard, env?: Record<string, string | undefined>): Metadata {
  const base = publicBaseUrl(env)
  const title = shareTitle(card)
  return {
    ...(base !== null && { metadataBase: base }),
    ...(title !== null && { title, openGraph: { title }, twitter: { title } }),
  }
}
