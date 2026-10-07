import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_BG } from './siteMeta'

/** Wartość `--bg-base` z pierwszego bloku o danym selektorze w globals.css. */
function bgBase(css: string, selector: string): string | undefined {
  const start = css.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
  if (start === -1) return undefined
  const block = css.slice(start, css.indexOf('\n}', start))
  return /--bg-base:\s*([^;]+);/.exec(block)?.[1].trim()
}

describe('THEME_BG', () => {
  const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8')

  it('matches --bg-base of the light (:root) and dark (.dark) theme in globals.css', () => {
    expect(bgBase(css, ':root')).toBe(THEME_BG.light)
    expect(bgBase(css, '.dark')).toBe(THEME_BG.dark)
  })
})
