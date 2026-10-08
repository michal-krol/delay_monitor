// @vitest-environment jsdom
import { renderToStaticMarkup as toMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GlobalError from './global-error'

vi.mock('./globals.css', () => ({}))

describe('global-error.tsx', () => {
  const html = toMarkup(<GlobalError error={Object.assign(new Error('SECRET-STACK'), { digest: 'd1' })} retry={() => {}} />)

  it('replaces the root layout: own <html lang="pl"> and <body>', () => {
    expect(html).toMatch(/^<html lang="pl"/)
    expect(html).toContain('<body')
  })

  it('has Polish copy with a retry button and a link to the Pulpit, no raw error text', () => {
    expect(html).toContain('Nie udało się wczytać aplikacji')
    expect(html).toContain('Spróbuj ponownie')
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Wróć do Pulpitu<\/a>/)
    expect(html).not.toMatch(/SECRET-STACK|d1/)
  })

  it('sets a document title (metadata is unsupported in error boundaries)', () => {
    expect(html).toContain('<title>')
  })
})
