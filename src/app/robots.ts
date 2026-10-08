import type { MetadataRoute } from 'next'
import { publicBaseUrl } from '@/lib/share/metadata'

// Domena z env w czasie żądania, nie budowania: statyczny prerender zamroziłby adres sprzed ustawienia `RAILWAY_PUBLIC_DOMAIN`.
export const dynamic = 'force-dynamic'

/** `/api/` to dane dla aplikacji, nie strony do indeksowania (i każde trafienie to zapytanie do naszych cache'y). */
export default function robots(): MetadataRoute.Robots {
  const base = publicBaseUrl()
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    // Bez znanej domeny (lokalnie) nie zgadujemy hosta — robots.txt bez linii Sitemap jest poprawny.
    ...(base !== null && { sitemap: new URL('/sitemap.xml', base).toString() }),
  }
}
