import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

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

  it('surface border comes from the border-surface-border utility, not inline styles', () => {
    expect(offenders(/borderColor: 'var\(--surface-border\)'/)).toEqual([])
  })

  it('GTFS views never use green, which reads as „na czas” (#13)', () => {
    expect(offenders(/\b(text|bg)-(green|emerald)-\d/)).toEqual([])
  })
})
