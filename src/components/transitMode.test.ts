import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LINE_PALETTE, lineColor } from './transitMode'

/** Kontrast WCAG 2.x dwóch `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(hex.slice(1, 3)) + 0.7152 * channel(hex.slice(3, 5)) + 0.0722 * channel(hex.slice(5, 7))
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('LINE_PALETTE — jeden kolor na kategorię linii', () => {
  it('ma wartości ustalone z właścicielem', () => {
    expect(LINE_PALETTE.metro).toEqual({ bg: '#f8d958', fg: '#9f1216' })
    expect(LINE_PALETTE.tram.bg).toBe('#0e7490')
    expect(LINE_PALETTE.rail.bg).toBe('#2563eb')
    expect(LINE_PALETTE.bus.bg).toBe('#880077')
    expect(LINE_PALETTE.express.bg).toBe('#b60000')
    expect(LINE_PALETTE.zone.bg).toBe('#006800')
    expect(LINE_PALETTE.local.bg).toBe('#000088')
    expect(LINE_PALETTE.night.bg).toBe('#000000')
    expect(LINE_PALETTE.replacement.bg).toBe('#57534e')
    expect(LINE_PALETTE.other.bg).toBe('#6b7280')
  })

  it('kolory tła są parami różne', () => {
    const backgrounds = Object.values(LINE_PALETTE).map((c) => c.bg)
    expect(new Set(backgrounds).size).toBe(backgrounds.length)
  })

  it('żaden kolor kategorii nie jest kolorem statusu z globals.css (#13: autobus nie może czytać się jak „na czas”)', () => {
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
    const status = [...css.matchAll(/--status-[\w-]+:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase())
    expect(status.length).toBeGreaterThan(0)
    const used = Object.values(LINE_PALETTE).map((c) => c.bg) // tekst (biały) celowo wspólny z tokenami `-fg` — kolor kategorii to tło
    expect(used.filter((color) => status.includes(color))).toEqual([])
  })

  it.each(Object.entries(LINE_PALETTE))('tekst na plakietce %s ma kontrast ≥ 4,5:1', (_category, { bg, fg }) => {
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('lineColor(mode, kind)', () => {
  it('zwykła linia: kolor rodzaju środka', () => {
    expect(lineColor('metro', 'regular')).toBe(LINE_PALETTE.metro)
    expect(lineColor('tram', 'regular')).toBe(LINE_PALETTE.tram)
    expect(lineColor('bus', 'regular')).toBe(LINE_PALETTE.bus)
    expect(lineColor('rail', 'regular')).toBe(LINE_PALETTE.rail)
    expect(lineColor('other', 'regular')).toBe(LINE_PALETTE.other)
  })

  it('autobus: rodzaj linii wybiera kolor (nocna, przyspieszona, strefowa, lokalna, zastępcza)', () => {
    expect(lineColor('bus', 'night')).toBe(LINE_PALETTE.night)
    expect(lineColor('bus', 'express')).toBe(LINE_PALETTE.express)
    expect(lineColor('bus', 'zone')).toBe(LINE_PALETTE.zone)
    expect(lineColor('bus', 'local')).toBe(LINE_PALETTE.local)
    expect(lineColor('bus', 'replacement')).toBe(LINE_PALETTE.replacement)
  })

  it('metro i kolej zostają przy kolorze rodzaju niezależnie od rodzaju linii', () => {
    expect(lineColor('metro', 'replacement')).toBe(LINE_PALETTE.metro)
    expect(lineColor('rail', 'local')).toBe(LINE_PALETTE.rail)
  })
})
