import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODE_COLOR } from './map/mapData'
import { ACCENT_GRADIENT } from './icons'

/**
 * Strażnik tokenów (PR 7): kolory statusu, błędu i obramowania powierzchni mają
 * jedno źródło w `globals.css`. Test skanuje źródła, bo regresją jest tu nowy
 * literał wpisany obok tokenu, a nie zmiana zachowania.
 */
const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** `plik:linia  treść` dla każdej linii pasującej do wzorca — czytelny komunikat porażki. */
function offenders(pattern: RegExp, skip: (file: string) => boolean = () => false): string[] {
  return sourceFiles(SRC)
    .filter((file) => !skip(relative(SRC, file).replaceAll('\\', '/')))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => (pattern.test(line) ? [`${relative(SRC, file)}:${index + 1}  ${line.trim()}`] : [])),
    )
}

describe('design tokens', () => {
  it('status colours come only from --status-* (no RGB triplets or hexes of the status palette)', () => {
    // `map/mapData.ts` to paleta RODZAJÓW transportu (#13), nie statusu — celowo poza strażnikiem.
    const pattern = /\b(22, ?163, ?74|234, ?88, ?12|225, ?29, ?72|79, ?70, ?229|2, ?132, ?199|51, ?65, ?85)\b|#(15803d|4f46e5|94a3b8|e11d48)\b/i
    expect(offenders(pattern, (file) => file === 'components/map/mapData.ts')).toEqual([])
  })

  it('error text uses the single --error-text token', () => {
    expect(offenders(/\btext-(red|rose)-\d/)).toEqual([])
  })

  it('warning text uses the single --warning-text token (was amber-600/700 + dark:amber-400 in three variants)', () => {
    // Plakietki z własnym bursztynowym tłem (StationCard, OnRequestBadge, MapCard) to para tło+tekst, nie kolor ostrzeżenia.
    expect(offenders(/\btext-amber-600\b|\bdark:text-amber-400\b|WARNING_CLASS/)).toEqual([])
  })

  it('surface border comes from the border-surface-border utility, not inline styles', () => {
    expect(offenders(/borderColor: 'var\(--surface-border\)'/)).toEqual([])
  })

  it('inline <svg> only in icons.tsx, except charts (PR 7b; the station-card art left in PR2 Pulpit-karty)', () => {
    // Wykresy (DelayForecast: wykres + dwie próbki linii w legendzie; NetworkStatsCard: sparkline + pierścień)
    // to nie ikony.
    const allowed: Record<string, number> = { 'components/DelayForecast.tsx': 3, 'components/NetworkStatsCard.tsx': 2 }
    const counts: Record<string, number> = {}
    for (const hit of offenders(/<svg\b/, (file) => file === 'components/icons.tsx')) {
      const file = hit.split(':')[0].replaceAll('\\', '/')
      counts[file] = (counts[file] ?? 0) + 1
    }
    expect(counts).toEqual(allowed)
  })

  it('lucide is imported only by icons.tsx (single icon source, .claude/rules/ui-icons.md)', () => {
    expect(offenders(/from ['"]lucide/, (file) => file === 'components/icons.tsx')).toEqual([])
  })

  it('motion libraries have one importer each: AnimatedNumber (number-flow) and useRowAnimation (auto-animate), .claude/rules/ui-motion.md', () => {
    expect(offenders(/from ['"]@number-flow/, (file) => file === 'components/AnimatedNumber.tsx')).toEqual([])
    expect(offenders(/from ['"]@formkit\/auto-animate/, (file) => file === 'hooks/useRowAnimation.ts')).toEqual([])
  })

  it('ACCENT_GRADIENT (favicon and app icon routes, no CSS there) mirrors --accent-gradient in globals.css', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    expect(css.match(/--accent-gradient:\s*([^;]+);/)?.[1].trim()).toBe(ACCENT_GRADIENT)
  })

  it('expand/collapse uses DisclosureIcon (one rotation rule in globals.css), not per-site chevron rotation', () => {
    expect(offenders(/ChevronDownIcon|group-open[^\s"'`]*:-?rotate|Chevron\w*Icon[^>]*\brotate-90\b/, (file) => file === 'components/icons.tsx')).toEqual([])
  })

  it('every lucideIcon() call is marked pure, so bundlers drop icons nobody imports', () => {
    const source = readFileSync(join(SRC, 'components/icons.tsx'), 'utf8')
    const calls = [...source.matchAll(/=\s*(\/\* @__PURE__ \*\/ )?lucideIcon\(/g)]
    expect(calls.length).toBeGreaterThan(40)
    expect(calls.filter((call) => call[1] === undefined).map((call) => call[0])).toEqual([])
  })

  it('icon sizes 10–19 px come from the ICON_SIZE role scale, not ad-hoc literals', () => {
    // Rozmiary ≥ 20 to ilustracje (logo, kafelek pogody, miniatura stacji), nie role ikon.
    expect(offenders(/size=\{1\d\}/)).toEqual([])
  })

  it('an icon set inline in a line of text uses ICON_SIZE.inline (.claude/rules/ui-icons.md), not the chip size', () => {
    expect(offenders(/size=\{ICON_SIZE\.chip\}[^>]*className="[^"]*\binline align-/)).toEqual([])
  })

  it('mode colours on the map never reuse a status colour (#13: a bus must not read as „na czas”)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const statusBg = [...css.matchAll(/--status-\w+-bg:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase())
    // Paleta ma jedno źródło (`transitMode.tsx`), `MODE_COLOR` jest z niej wyprowadzone — pełny test palety: `transitMode.test.ts`.
    const modeColors = Object.values(MODE_COLOR).map((color) => color.toLowerCase())
    expect(statusBg.length).toBeGreaterThan(0)
    expect(modeColors).toHaveLength(5)
    expect(modeColors.filter((color) => statusBg.includes(color))).toEqual([])
  })

  it('GTFS views never use status-green Tailwind classes (#13); the category green of zone buses comes from LINE_PALETTE, see adr/0005', () => {
    expect(offenders(/\b(text|bg)-(green|emerald)-\d/)).toEqual([])
  })

  it('globals.css defines the shell layout tokens and the motion tokens (PR 2 / PR 6)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    for (const token of ['--header-h', '--bottom-nav-h', '--ease-spring', '--ease-out', '--duration-fast', '--duration-base', '--duration-slow']) {
      expect(css).toContain(`${token}:`)
    }
    expect(css).toContain('scroll-padding-bottom: var(--bottom-nav-h)')
    expect(css).toContain('scroll-padding-top: var(--header-h)')
  })

  it('no text below 12 px (text-xs is the floor on phones, PR 5)', () => {
    expect(offenders(/text-\[1[01]px\]/)).toEqual([])
  })

  it('UI copy: a failed fetch is „Nie udało się …", never „Błąd …"; no „słupek" for a stop (.claude/rules/ui-copy.md)', () => {
    // API JSON (`src/app/api`) i komunikaty `Error` to nie tekst dla użytkownika.
    expect(offenders(/^\s*Błąd |>Błąd |['"]Błąd /, (file) => file.startsWith('app/api/'))).toEqual([])
    // „słupki" wykresu w komentarzach są w porządku — gwarantujemy tylko brak „słupek przystank…" w tekście UI.
    expect(offenders(/[>'"`]\s*[Ss]łupek|słupka?\s+(przystank|nr)/)).toEqual([])
  })

  it('UI copy: user-visible text says „Start", never „Pulpit"', () => {
    // Identyfikatory (`PulpitPage`, `PULPIT_SUBTITLE`, `'pulpit'`) nie pasują do słowa z granicami; komentarze
    // (`//`, `*`, `{/*`, także w środku linii) odpadają, bo przed słowem nie może być `//` ani `/*`.
    const pattern = /^(?!\s*(?:\/\/|\*|\/\*|\{\/\*))(?:(?!\/\/|\/\*).)*\bPulp(?:it[a-z]*|icie)\b/
    expect(offenders(pattern, (file) => file.startsWith('app/api/'))).toEqual([])
  })

  it('card-hover lifts only where hover exists (a tap must not leave a card stuck raised)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const rule = css.match(/\.card-hover:hover\s*\{/)
    expect(rule).not.toBeNull()
    const before = css.slice(0, rule!.index)
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/^@media \(hover: hover\)\s*\{\s*$/)
  })

  it('skeleton pulse stops under prefers-reduced-motion in one global rule (not per site)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const rule = css.match(/\.animate-pulse\s*\{\s*animation:\s*none/)
    expect(rule).not.toBeNull()
    const before = css.slice(0, rule!.index)
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/^@media \(prefers-reduced-motion: reduce\)\s*\{\s*$/)
    expect(offenders(/motion-reduce:animate-none/)).toEqual([])
  })

  it('blur comes only from the glass-chrome utilities in globals.css (no backdrop-blur-* classes)', () => {
    expect(offenders(/backdrop-blur/)).toEqual([])
  })

  it('globals.css writes backdrop-filter unprefixed only: with a hand-written -webkit- twin the build kept ONLY the prefixed one and Chromium rendered no blur', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    expect(css).not.toContain('-webkit-backdrop-filter')
  })

  it('content cards (.glass, .glass-strong) carry no backdrop-filter — blur over a flat page is invisible and costs GPU', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    for (const name of ['glass', 'glass-strong']) {
      const body = css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))?.[1]
      expect(body, name).toBeDefined()
      expect(body, name).not.toContain('backdrop-filter')
    }
  })

  it('glass-chrome falls back to solid under prefers-reduced-transparency', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const block = css.match(/@media \(prefers-reduced-transparency: reduce\)[^{]*\{([\s\S]*?\n\})/)?.[1] ?? ''
    expect(block).toContain('.glass-chrome')
    expect(block).toContain('.glass-chrome-strong')
    expect(block).toContain('backdrop-filter: none')
    expect(block).toContain('var(--sheet-surface)')
  })

  it('floating chrome (map controls, menus, offline pill, nav bars) uses glass-chrome, not the content-card glass', () => {
    const contentGlass = /(^|[\s"'`])glass(-strong)?(?![-\w])/
    const chromeFiles = (file: string): boolean =>
      !(file.startsWith('components/map/') || ['components/OfflineBanner.tsx', 'components/MobileHeader.tsx', 'components/BottomNav.tsx'].includes(file))
    // Mapa: kontrolki, menu i panele; tekst komentarzy pomijamy (linie zaczynające się od `//`, `*`, `{/*`).
    const hits = offenders(contentGlass, chromeFiles).filter((hit) => !/:\d+\s+(\/\/|\*|\{\/\*)/.test(hit))
    expect(hits).toEqual([])
  })

  it('the sheet panel is near-opaque, not fully transparent (axe contrast over the map canvas)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const panel = css.match(/\.bottom-sheet__panel \{([^}]*)\}/)?.[1] ?? ''
    expect(panel).toMatch(/color-mix\(in srgb, var\(--sheet-surface\) (9\d)%/)
  })

  it('pulses, entry transitions and card press only exist under prefers-reduced-motion: no-preference', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    for (const rule of ['animation: livePulse', 'animation: star-pop', '@starting-style', '.card-press:has([data-card-open]:active)']) {
      const index = css.indexOf(rule)
      expect(index, rule).toBeGreaterThan(-1)
      const before = css.slice(0, index)
      expect(before.slice(before.lastIndexOf('@media')), rule).toMatch(/^@media \(prefers-reduced-motion: no-preference\)\s*\{/)
    }
  })

  it('the header title swap is scroll-driven progressive enhancement: hidden by default, animated only with support and motion allowed', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/\.header-title-context\s*\{\s*display:\s*none/)
    const index = css.indexOf('animation-timeline: scroll(root)')
    expect(index).toBeGreaterThan(-1)
    const before = css.slice(0, index)
    expect(before.slice(before.lastIndexOf('@supports'))).toMatch(/^@supports \(animation-timeline: scroll\(\)\)/)
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/^@media \(prefers-reduced-motion: no-preference\)/)
  })

  it('menu entries (.enter-pop) never scale: a scaled panel shrinks its 44 px touch targets while it opens (e2e touch-targets measured 43.2 px)', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    const rules = [...css.matchAll(/\.enter-pop\s*\{([^}]*)\}/g)].map((match) => match[1]).join(' ')
    expect(rules).toContain('translate')
    expect(rules).not.toMatch(/scale/)
  })

  it('both Pulpit cards carry the card-press class (one press feel)', () => {
    for (const file of ['components/StationCard.tsx', 'components/TransitStopCard.tsx']) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toContain('card-press')
    }
  })

  it('globals.css kills the grey tap flash and defines the own press state', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    expect(css).toContain('-webkit-tap-highlight-color: transparent')
    expect(css).toMatch(/\.press:active\s*\{/)
  })
})

/** Treść bloku `{ … }` zaczynającego się od `header` (z dopasowaniem nawiasów); `''` gdy brak. */
function blockOf(css: string, header: string): string {
  const start = css.indexOf(header)
  if (start === -1) return ''
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return ''
}

/** Deklaracje `--token: wartość` ze WSZYSTKICH bloków `selector { … }` zaczynających się w kolumnie 0 (motyw jasny = `:root`, ciemny = `.dark`). */
function themeTokens(css: string, selector: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const match of css.matchAll(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{`, 'g'))) {
    // Przy kilku blokach `:root` czytamy ten, który zaczyna się w `match.index`.
    const body = blockOf(css.slice(match.index), match[0].trimStart())
    for (const decl of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[decl[1]] = decl[2].trim()
  }
  return tokens
}

type Rgba = [number, number, number, number]

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba
  const rgba = value.match(/^rgba?\(([^)]+)\)$/)
  if (!rgba) throw new Error(`unsupported colour: ${value}`)
  const [r, g, b, a = 1] = rgba[1].split(',').map(Number)
  return [r, g, b, a]
}

/** Alfa nałożona na nieprzezroczyste tło (jak robi to przeglądarka i axe). */
function over(top: Rgba, bottom: Rgba): Rgba {
  const [r, g, b, a] = top
  return [0, 1, 2].map((i) => Math.round([r, g, b][i] * a + bottom[i] * (1 - a))).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number): number => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('F0 foundation: primary colour, shared classes, motion', () => {
  const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
  const themes = { light: themeTokens(css, ':root'), dark: themeTokens(css, '.dark') }
  const PRIMARY = ['--primary', '--primary-fg', '--primary-soft', '--primary-text']

  function colours(theme: 'light' | 'dark') {
    const t = themes[theme]
    const base = parseColor(t['--bg-base'])
    return {
      base,
      sheet: parseColor(t['--sheet-surface']),
      primary: parseColor(t['--primary']),
      fg: parseColor(t['--primary-fg']),
      text: parseColor(t['--primary-text']),
      soft: over(parseColor(t['--primary-soft']), base),
    }
  }

  it('primary tokens exist in both themes (--primary, --primary-fg, --primary-soft, --primary-text)', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const token of PRIMARY) expect(themes[theme][token], `${theme} ${token}`).toBeDefined()
    }
    expect(themes.light['--nav-active-bg']).toBe('var(--primary-soft)')
    expect(themes.dark['--nav-active-bg']).toBe('var(--primary-soft)')
    expect(themes.light['--nav-active-text']).toBe('var(--primary-text)')
    expect(themes.dark['--nav-active-text']).toBe('var(--primary-text)')
    // Logo i ikony nadal rysują się gradientem akcentu.
    expect(themes.light['--accent-gradient']).toBeDefined()
    expect(themes.light['--accent-solid']).toBeDefined()
  })

  it('primary-fg on primary is >= 4.5:1 in light and dark', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = colours(theme)
      expect(contrast(c.fg, c.primary), theme).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('primary-text on --bg-base, --sheet-surface and --primary-soft is >= 4.5:1 in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = colours(theme)
      expect(contrast(c.text, c.base), `${theme} on bg-base`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.text, c.sheet), `${theme} on sheet-surface`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.text, c.soft), `${theme} on primary-soft`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('primary fill against --bg-base is >= 3:1 in both themes (active outline/non-text)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = colours(theme)
      expect(contrast(c.primary, c.base), theme).toBeGreaterThanOrEqual(3)
    }
  })

  it('card radius 16px, page gutter 16px (12px at 320px), 44px control floor are tokens', () => {
    expect(css).toMatch(/@theme inline \{[^}]*--radius-card:\s*1rem;/)
    expect(themes.light['--page-gutter']).toBe('1rem')
    expect(css).toMatch(/@media \(max-width: 21rem\)\s*\{\s*:root\s*\{[^}]*--page-gutter:\s*0\.75rem;/)
    expect(themes.light['--control-min']).toBe('2.75rem')
    const theme = blockOf(css, '@theme inline')
    for (const name of ['primary', 'primary-fg', 'primary-soft', 'primary-text']) {
      expect(theme, name).toContain(`--color-${name}: var(--${name});`)
    }
  })

  it('shared classes exist: segment, chip-filter, btn-primary, control-44, page-title, time-dominant, star-pop', () => {
    expect(css).toContain('Wspólne klasy interakcji (F0)')
    for (const utility of ['page-title', 'time-dominant', 'control-44']) expect(css, utility).toContain(`@utility ${utility} {`)
    for (const rule of ['.segment', '.segment-item', '.chip-filter', '.btn-primary', '.star-pop']) {
      expect(css, rule).toMatch(new RegExp(`${rule.replace('.', '\\.')}[\\s,:{\\[]`))
    }
    // 24/30 i 24/28 — wspólne wymiary tytułu strony i dominującego czasu.
    expect(blockOf(css, '@utility page-title')).toMatch(/font-size:\s*1\.5rem[\s\S]*line-height:\s*1\.875rem[\s\S]*font-weight:\s*800/)
    expect(blockOf(css, '@utility time-dominant')).toMatch(/font-size:\s*1\.5rem[\s\S]*line-height:\s*1\.75rem[\s\S]*tabular-nums/)
    for (const rule of ['.segment-item', '.chip-filter', '.btn-primary']) {
      expect(blockOf(css, `${rule} {`), rule).toContain('min-height: var(--control-min)')
      expect(css, `${rule} focus`).toContain(`${rule}:focus-visible`)
    }
  })

  it('active segment/chip keep a visible outline under forced-colors', () => {
    const forced = blockOf(css, '@media (forced-colors: active) {')
    expect(forced).toMatch(/\.segment-item[\s\S]*outline:\s*2px solid (Highlight|ButtonText)/)
    expect(forced).toMatch(/\.chip-filter[\s\S]*outline:\s*2px solid (Highlight|ButtonText)/)
  })

  it('live-dot runs once (no infinite animation) and only under no-preference', () => {
    const rule = css.match(/\.live-dot \{\s*animation:\s*([^;]+);/)?.[1] ?? ''
    expect(rule).toMatch(/^livePulse 2\.2s ease-out 1$/)
    expect(rule).not.toContain('infinite')
    const before = css.slice(0, css.indexOf('animation: livePulse'))
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/^@media \(prefers-reduced-motion: no-preference\)/)
  })

  it('star-pop scales glyph 1 -> 1.12 -> 1 in --duration-base, only under no-preference', () => {
    const frames = blockOf(css, '@keyframes star-pop')
    expect([...frames.matchAll(/scale\(([\d.]+)\)/g)].map((m) => m[1])).toEqual(['1', '1.12', '1'])
    const rule = css.match(/\.star-pop\[data-pop\] \{\s*animation:\s*([^;]+);/)?.[1] ?? ''
    expect(rule).toBe('star-pop var(--duration-base) var(--ease-spring)')
    const before = css.slice(0, css.indexOf('animation: star-pop'))
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/^@media \(prefers-reduced-motion: no-preference\)/)
  })

  it('nav-pill replaces the nav-halo glow: soft primary pastille behind the active icon', () => {
    expect(css).not.toContain('nav-halo')
    expect(css).toMatch(/\[data-active\] > \.nav-pill \{\s*background(-color)?:\s*var\(--primary-soft\)/)
    expect(readFileSync(join(SRC, 'components/BottomNav.tsx'), 'utf8')).toContain('nav-pill')
  })
})
