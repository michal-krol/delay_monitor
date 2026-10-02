import { describe, expect, it } from 'vitest'
import manifest from './manifest'
import { APP_DESCRIPTION } from '@/lib/siteMeta'

describe('manifest PWA', () => {
  const m = manifest()

  it('uruchamia się jak aplikacja (standalone) od strony głównej', () => {
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.lang).toBe('pl')
  })

  it('bierze opis z metadanych strony (jedno źródło)', () => {
    expect(m.description).toBe(APP_DESCRIPTION)
  })

  it('ma ikony PNG 192 i 512 z generatora app/icon.tsx', () => {
    expect(m.icons).toEqual([
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ])
  })

  it('ma skróty dokładnie do Pulpitu, Mapy i Linii', () => {
    expect((m.shortcuts ?? []).map((s) => s.url)).toEqual(['/', '/map', '/lines'])
  })

  it('używa wyłącznie względnych adresów z tego samego origin', () => {
    const urls = [m.start_url, m.scope, ...(m.shortcuts ?? []).map((s) => s.url), ...(m.icons ?? []).map((i) => i.src)]
    for (const url of urls) expect(url, String(url)).toMatch(/^\/(?!\/)/)
  })
})
