import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODE_COLOR } from './map/mapData'

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
})
