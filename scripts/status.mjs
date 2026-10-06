/**
 * `npm run status [-- --fetch]` — branch, HEAD, ahead/behind origin/dev, dirty
 * files and the branch's PR with CI state, in one call. Works without gh or
 * network (the PR line says why it is missing). `--fetch` refreshes origin/dev first.
 */
import { spawnSync } from 'node:child_process'
import { formatStatus, parseAheadBehind, parsePorcelain, summarizeChecks } from './lib/status.mjs'
import { git } from './lib/git.mjs'

const BASE = 'origin/dev'

if (process.argv.includes('--fetch')) git(['fetch', '--quiet', 'origin', 'dev'])

function readPr() {
  const r = spawnSync('gh', ['pr', 'view', '--json', 'number,state,statusCheckRollup'], {
    encoding: 'utf8',
    timeout: 15_000,
    shell: process.platform === 'win32',
  })
  if (r.error?.code === 'ENOENT') return { error: 'gh not installed' }
  if (r.error) return { error: r.error.message }
  if (r.status !== 0) {
    const msg = r.stderr.trim().split('\n')[0] || `gh exited ${r.status}`
    return /no pull requests found/i.test(msg) ? { none: true } : { error: msg }
  }
  try {
    const pr = JSON.parse(r.stdout)
    return { number: pr.number, state: pr.state, checks: summarizeChecks(pr.statusCheckRollup) }
  } catch {
    return { error: 'unexpected gh output' }
  }
}

const aheadBehindOut = git(['rev-list', '--left-right', '--count', `${BASE}...HEAD`])
console.log(
  formatStatus({
    branch: git(['branch', '--show-current']) || '(detached)',
    head: git(['log', '-1', '--format=%h %s']) ?? '(no commits)',
    base: BASE,
    aheadBehind: aheadBehindOut === null ? null : parseAheadBehind(aheadBehindOut),
    dirty: parsePorcelain(git(['status', '--porcelain']) ?? ''),
    pr: readPr(),
  }),
)
