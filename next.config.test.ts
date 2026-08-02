import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

/**
 * Nagłówki bezpieczeństwa łatwo osłabić przypadkiem — wystarczy dopisać jedno
 * źródło do CSP przy okazji innej zmiany. Te testy blokują ciche regresje.
 *
 * Vitest ustawia NODE_ENV na "test", więc widzimy tu wariant produkcyjny
 * (ostrzejszy: bez 'unsafe-eval' i bez websocketów).
 */
async function headersFor(path: string): Promise<Map<string, string>> {
  const groups = await nextConfig.headers!()
  const matching = groups.filter((group) => group.source === '/:path*')
  expect(matching.length, `brak reguły obejmującej ${path}`).toBeGreaterThan(0)

  return new Map(matching.flatMap((group) => group.headers.map((h) => [h.key, h.value] as const)))
}

describe('nagłówki bezpieczeństwa', () => {
  it('wysyła komplet nagłówków na każdej ścieżce', async () => {
    const headers = await headersFor('/')

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Permissions-Policy')).toContain('geolocation=()')
    expect(headers.get('Content-Security-Policy')).toBeDefined()
  })

  it('nie pozwala osadzić strony w ramce ani przejąć bazowego URL-a', async () => {
    const csp = (await headersFor('/')).get('Content-Security-Policy') ?? ''

    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("object-src 'none'")
  })

  it('ogranicza pobieranie zasobów i połączenia do własnego origin', async () => {
    const csp = (await headersFor('/')).get('Content-Security-Policy') ?? ''

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    // Gdyby ktoś dopisał obcy host, poniższe przestanie być prawdą.
    expect(csp).not.toMatch(/https?:\/\//)
    expect(csp).not.toContain('*')
  })

  it('nie dopuszcza eval w wariancie produkcyjnym', async () => {
    // 'unsafe-eval' jest potrzebny wyłącznie hot reloadowi w trybie dev.
    const csp = (await headersFor('/')).get('Content-Security-Policy') ?? ''
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('wymusza HTTPS poza trybem deweloperskim', async () => {
    const hsts = (await headersFor('/')).get('Strict-Transport-Security')
    expect(hsts).toContain('max-age=')
  })

  it('nie ogłasza użytego frameworka', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
