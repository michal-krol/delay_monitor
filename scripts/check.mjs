/**
 * `npm run check` — typecheck && lint && test (AGENTS.md #12). When all are
 * green and the working tree did not change meanwhile, writes the stamp
 * `<git common dir>/gate-ok-<tree>` that lets `.githooks/pre-push` skip the
 * gate for a push of that exact tree. Never stamps on failure.
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isStampName, staleStamps, stampName } from './lib/gate.mjs'
import { git, run } from './lib/git.mjs'

const STAMP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Tree hash of the working tree as checked (tracked + untracked, minus
 * .gitignore), via `git add -A` + `git write-tree` on a throwaway copy of the
 * index — the real index and staging stay untouched. Null when not in git.
 */
function workingTreeHash() {
  const index = git(['rev-parse', '--git-path', 'index'])
  if (index === null) return null
  const tmp = path.join(os.tmpdir(), `gate-index-${process.pid}-${Date.now()}`)
  try {
    if (existsSync(index)) copyFileSync(index, tmp)
    const env = { GIT_INDEX_FILE: tmp }
    if (git(['add', '-A'], env) === null) return null
    return git(['write-tree'], env)
  } finally {
    rmSync(tmp, { force: true })
  }
}

const before = workingTreeHash()
for (const script of ['typecheck', 'lint', 'test']) {
  const code = run('npm', ['run', script])
  if (code !== 0) process.exit(code)
}
const after = workingTreeHash()

const commonDir = git(['rev-parse', '--git-common-dir'])
if (before === null || commonDir === null) {
  console.log('check: green (no git tree — no gate stamp)')
} else if (before !== after) {
  console.log('check: green, but files changed during the run — no gate stamp; pre-push will re-run the gate')
} else {
  const dir = path.resolve(commonDir)
  writeFileSync(path.join(dir, stampName(after)), `${new Date().toISOString()}\n`)
  const entries = readdirSync(dir)
    .filter(isStampName)
    .map((name) => ({ name, mtimeMs: statSync(path.join(dir, name)).mtimeMs }))
  for (const name of staleStamps(entries, Date.now(), STAMP_MAX_AGE_MS)) rmSync(path.join(dir, name), { force: true })
  console.log(`check: green — gate stamp for tree ${after.slice(0, 12)}`)
}
