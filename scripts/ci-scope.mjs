/**
 * CI `changes` job: `node scripts/ci-scope.mjs <base sha> [head]` writes `e2e=true|false` to
 * $GITHUB_OUTPUT (and stdout). Fails open: no base (push events), a failing git diff or an empty
 * diff all mean "run the suite". Logic and tests: scripts/lib/ciScope.mjs.
 */
import { appendFileSync } from 'node:fs'
import { git } from './lib/git.mjs'
import { needsE2e } from './lib/ciScope.mjs'

const [base, head = 'HEAD'] = process.argv.slice(2)
const out = base ? git(['diff', '--name-only', base, head]) : null
const files = out === null ? null : out.split('\n').filter(Boolean)
const e2e = needsE2e(files)
console.log(`changed files: ${files ? files.length : 'unknown'} → e2e=${e2e}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `e2e=${e2e}\n`)
