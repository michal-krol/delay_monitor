/**
 * CI `changes` job: `node scripts/ci-scope.mjs <base sha> [head]` writes `e2e=true|false` and the Playwright
 * `matrix` JSON to $GITHUB_OUTPUT (and stdout). Event and base branch come from CI_EVENT / CI_BASE_REF.
 * Fails open: no base (push events), a failing git diff or an empty diff all mean "run the suite".
 * Logic and tests: scripts/lib/ciScope.mjs, scripts/ci-scope.test.mjs.
 */
import { appendFileSync } from 'node:fs'
import { git } from './lib/git.mjs'
import { e2eMatrix, needsE2e } from './lib/ciScope.mjs'

const [base, head = 'HEAD'] = process.argv.slice(2)
// --no-renames: a moved file must list its OLD path too, else `src/x.ts` -> `scripts/x.ts` looks docs-only
const out = base ? git(['diff', '--name-only', '--no-renames', base, head]) : null
const files = out === null ? null : out.split('\n').filter(Boolean)
const e2e = needsE2e(files)
const matrix = JSON.stringify(e2eMatrix({ event: process.env.CI_EVENT, baseRef: process.env.CI_BASE_REF }))
console.log(`changed files: ${files ? files.length : 'unknown'} → e2e=${e2e}, matrix=${matrix}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `e2e=${e2e}\nmatrix=${matrix}\n`)
