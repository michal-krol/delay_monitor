import { describe, expect, it } from 'vitest'
import { cardMetadata, publicBaseUrl } from './metadata'

const PLACE = { kind: 'place', label: 'Stacja kolejowa', title: 'Szczecin Główny', detail: null, mode: 'rail', city: null } as const
const TITLE = 'Szczecin Główny — Monitor opóźnień'

describe('cardMetadata', () => {
  it('generic card keeps the root metadata', () => {
    expect(cardMetadata({ kind: 'generic' }, {})).toEqual({})
  })
  it('place card sets title, og:title and twitter:title', () => {
    expect(cardMetadata(PLACE, {})).toEqual({ title: TITLE, openGraph: { title: TITLE }, twitter: { title: TITLE } })
  })
  it('sets metadataBase from the Railway domain, for generic cards too (og:image must be absolute)', () => {
    const env = { RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app' }
    expect(String(cardMetadata({ kind: 'generic' }, env).metadataBase)).toBe('https://app.up.railway.app/')
    expect(String(cardMetadata(PLACE, env).metadataBase)).toBe('https://app.up.railway.app/')
  })
})

describe('publicBaseUrl', () => {
  it('is null when the variable is missing or not a hostname', () => {
    expect(publicBaseUrl({})).toBeNull()
    for (const bad of ['', 'evil.com/path', 'a b', 'x@evil.com', 'http://x.com', '-x.com']) {
      expect(publicBaseUrl({ RAILWAY_PUBLIC_DOMAIN: bad })).toBeNull()
    }
  })
})
