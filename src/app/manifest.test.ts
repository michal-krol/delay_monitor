import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'
import { generateImageMetadata } from './icon'
import { APP_DESCRIPTION, THEME_BG } from '@/lib/siteMeta'

describe('manifest PWA', () => {
  const m = manifest()

  it('uruchamia się jak aplikacja (standalone) od strony głównej', () => {
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.id).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.lang).toBe('pl')
  })

  it('bierze opis z metadanych strony (jedno źródło)', () => {
    expect(m.description).toBe(APP_DESCRIPTION)
  })

  it('ma ikony PNG 192 i 512 z generatora app/icon.tsx, zwykłe i maskowalne', () => {
    expect(m.icons).toEqual([
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/icon/maskable-192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })

  it('każda ikona manifestu istnieje w generateImageMetadata z tym samym rozmiarem i typem', () => {
    const generated = generateImageMetadata()
    for (const icon of m.icons ?? []) {
      const entry = generated.find((g) => `/icon/${g.id}` === icon.src)
      expect(entry, icon.src).toBeDefined()
      expect(`${entry!.size.width}x${entry!.size.height}`, icon.src).toBe(icon.sizes)
      expect(entry!.contentType, icon.src).toBe(icon.type)
    }
  })

  it('kolory = `--bg-base` jasnego motywu (THEME_BG, pilnowane względem globals.css)', () => {
    expect(m.background_color).toBe(THEME_BG.light)
    expect(m.theme_color).toBe(THEME_BG.light)
  })

  it('ma skróty dokładnie do Pulpitu, Odjazdów, Mapy i Linii (Android pokazuje najwyżej 4)', () => {
    expect((m.shortcuts ?? []).length).toBeLessThanOrEqual(4)
    expect((m.shortcuts ?? []).map((s) => s.url)).toEqual(['/', '/city', '/map', '/lines'])
  })

  it('każdy skrót ma własną ikonę 192×192, istniejącą w generateImageMetadata', () => {
    const generated = generateImageMetadata()
    const srcs = (m.shortcuts ?? []).map((s) => s.icons ?? [])
    expect(srcs.map((icons) => icons.map((i) => i.src))).toEqual([
      ['/icon/shortcut-pulpit'],
      ['/icon/shortcut-odjazdy'],
      ['/icon/shortcut-mapa'],
      ['/icon/shortcut-linie'],
    ])
    for (const icon of srcs.flat()) {
      const entry = generated.find((g) => `/icon/${g.id}` === icon.src)
      expect(entry, icon.src).toBeDefined()
      expect(`${entry!.size.width}x${entry!.size.height}`, icon.src).toBe('192x192')
      expect(icon.sizes, icon.src).toBe('192x192')
      expect(icon.type, icon.src).toBe('image/png')
    }
  })

  it('jest w kategoriach podróże i transport', () => {
    expect(m.categories).toEqual(['travel', 'transportation'])
  })

  it('ma zrzuty dla okna instalacji: co najmniej 2 wąskie i 1 szeroki, pliki istnieją w public/', () => {
    const shots = m.screenshots ?? []
    expect(shots.filter((s) => s.form_factor === 'narrow').length).toBeGreaterThanOrEqual(2)
    expect(shots.filter((s) => s.form_factor === 'wide').length).toBeGreaterThanOrEqual(1)
    for (const s of shots) {
      expect(s.type, s.src).toBe('image/png')
      expect(existsSync(join(process.cwd(), 'public', s.src)), s.src).toBe(true)
    }
  })

  it('używa wyłącznie względnych adresów z tego samego origin', () => {
    const urls = [
      m.start_url,
      m.scope,
      ...(m.shortcuts ?? []).flatMap((s) => [s.url, ...(s.icons ?? []).map((i) => i.src)]),
      ...(m.icons ?? []).map((i) => i.src),
      ...(m.screenshots ?? []).map((s) => s.src),
    ]
    for (const url of urls) expect(url, String(url)).toMatch(/^\/(?!\/)/)
  })
})
