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

  it('inline <svg> only in icons.tsx, except charts and the card background art (PR 7b)', () => {
    // Wykresy (DelayForecast: wykres + dwie próbki linii w legendzie; NetworkStatsCard: sparkline + pierścień)
    // i dekoracyjne tło karty stacji to nie ikony.
    const allowed: Record<string, number> = { 'components/DelayForecast.tsx': 3, 'components/NetworkStatsCard.tsx': 2, 'components/StationCard.tsx': 1 }
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

  it('globals.css kills the grey tap flash and defines the own press state', () => {
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
    expect(css).toContain('-webkit-tap-highlight-color: transparent')
    expect(css).toMatch(/\.press:active\s*\{/)
  })
})
