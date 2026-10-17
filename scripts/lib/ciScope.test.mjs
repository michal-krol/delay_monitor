import { describe, expect, it } from 'vitest'
import { needsE2e } from './ciScope.mjs'

describe('needsE2e', () => {
  it('skips a change made only of docs, agent rules, scripts, hooks and unit tests', () => {
    expect(
      needsE2e([
        'README.md',
        'CHANGELOG.md',
        'AGENTS.md',
        'adr/0012-gps.md',
        '.claude/rules/testing.md',
        '.claude/skills/cleanup/SKILL.md',
        '.claude/settings.json',
        '.githooks/pre-push',
        'scripts/clean-worktrees.mjs',
        'scripts/lib/status.test.mjs',
        'src/lib/board/realization.test.ts',
        'src/components/Foo.test.tsx',
        'next.config.test.ts',
        '.github/workflows/claude-review.yml',
        '.github/PULL_REQUEST_TEMPLATE.md',
        'LICENSE',
      ]),
    ).toBe(false)
  })

  it('runs for anything that can change the built app or the e2e suite', () => {
    for (const file of [
      'src/components/Foo.tsx',
      'src/app/api/health/route.ts',
      'src/lib/board/realization.ts',
      'public/maplibre-gl-worker.mjs',
      'e2e/map.spec.ts',
      'e2e/helpers/test.ts',
      'fixtures/pkp/board.json',
      'data/station-coordinates.json',
      'package.json',
      'package-lock.json',
      'next.config.ts',
      'playwright.config.ts',
      'tsconfig.json',
      'Dockerfile',
      '.nvmrc',
      '.github/workflows/ci.yml',
    ]) {
      expect(needsE2e([file]), file).toBe(true)
    }
  })

  it('one relevant file among skippable ones is enough', () => {
    expect(needsE2e(['README.md', 'src/components/Foo.tsx'])).toBe(true)
  })

  it('an unknown file type runs the suite (allowlist, not denylist)', () => {
    expect(needsE2e(['something.new'])).toBe(true)
  })

  it('an empty or unknown change list runs the suite', () => {
    expect(needsE2e([])).toBe(true)
    expect(needsE2e(null)).toBe(true)
  })

  it('normalizes Windows separators', () => {
    expect(needsE2e(['.claude\rules\testing.md'])).toBe(false)
  })
})
