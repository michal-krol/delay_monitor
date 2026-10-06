/**
 * Pre-push gate (AGENTS.md #12), called by `.githooks/pre-push` with git's
 * ref list on stdin:
 *  1. `npm run deps:check` — always.
 *  2. `npm run check` — skipped when every pushed commit's tree has the stamp
 *     a green `npm run check` left (`scripts/check.mjs`).
 *  3. `npx next build --webpack` — only when the pushed range touches
 *     `src/app/**` (tsc misses Next's route/page export rules, `.claude/rules/testing.md`).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { diffBases, parsePrePushInput, planPrePush, stampName } from './lib/gate.mjs'
import { git, run } from './lib/git.mjs'

const INTEGRATION_BRANCHES = ['origin/dev', 'origin/main']

function changedFiles(update) {
  const mergeBase = INTEGRATION_BRANCHES.map((ref) => git(['merge-base', update.localSha, ref])).find(Boolean) ?? null
  for (const base of diffBases(update, mergeBase)) {
    const out = git(['diff', '--name-only', base, update.localSha])
    if (out !== null) return out.split('\n').filter(Boolean)
  }
  return null
}

const updates = parsePrePushInput(readFileSync(0, 'utf8'))

const depsCode = run('npm', ['run', 'deps:check'])
if (depsCode !== 0) process.exit(depsCode)

const commonDir = path.resolve(git(['rev-parse', '--git-common-dir']) ?? '.git')
const facts = updates.map((update) => {
  const tree = git(['rev-parse', `${update.localSha}^{tree}`])
  return {
    tree,
    stamped: tree !== null && existsSync(path.join(commonDir, stampName(tree))),
    changedFiles: changedFiles(update),
  }
})
const plan = planPrePush(facts)

if (plan.runCheck) {
  const code = run('npm', ['run', 'check'])
  if (code !== 0) process.exit(code)
} else if (facts.length > 0) {
  console.log(`pre-push: gate skipped — tree ${facts.map((f) => f.tree.slice(0, 12)).join(', ')} already passed npm run check`)
}

if (plan.runBuild) {
  console.log('pre-push: range touches src/app/ — npx next build --webpack')
  const code = run('npx', ['next', 'build', '--webpack'])
  if (code !== 0) process.exit(code)
}
