import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ci-scope.mjs')
let repo
let outFile

function git(...args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function run(base, env = {}) {
  writeFileSync(outFile, '')
  const r = spawnSync(process.execPath, [script, base], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: outFile, CI_EVENT: 'pull_request', CI_BASE_REF: 'dev', ...env },
  })
  expect(r.status).toBe(0)
  return Object.fromEntries(readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
}

beforeAll(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), 'ci-scope-'))
  outFile = path.join(repo, '..', `ci-scope-out-${path.basename(repo)}`)
  git('init', '-q', '-b', 'dev')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  mkdirSync(path.join(repo, 'src'))
  writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1\n'.repeat(20))
  writeFileSync(path.join(repo, 'README.md'), 'x\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(outFile, { force: true })
})

describe('scripts/ci-scope.mjs', () => {
  it('docs-only diff skips e2e and drops WebKit for a PR to dev', () => {
    const base = git('rev-parse', 'HEAD')
    writeFileSync(path.join(repo, 'README.md'), 'changed\n')
    git('commit', '-qam', 'docs')
    const out = run(base)
    expect(out.e2e).toBe('false')
    expect(JSON.parse(out.matrix).include.map((p) => p.project)).toEqual(['desktop-chromium', 'mobile-chromium'])
  })

  it('a rename out of src/ still runs e2e (the old path is listed)', () => {
    const base = git('rev-parse', 'HEAD')
    mkdirSync(path.join(repo, 'scripts'))
    git('mv', 'src/a.ts', 'scripts/a.ts')
    git('commit', '-qm', 'move')
    expect(run(base).e2e).toBe('true')
  })

  it('no base (push event) runs everything including WebKit', () => {
    const out = run('', { CI_EVENT: 'push', CI_BASE_REF: '' })
    expect(out.e2e).toBe('true')
    expect(JSON.parse(out.matrix).include.map((p) => p.project)).toContain('mobile-safari')
  })

  it('an unknown base sha fails open', () => {
    expect(run('0000000000000000000000000000000000000000').e2e).toBe('true')
  })
})
