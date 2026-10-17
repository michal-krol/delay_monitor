/**
 * `npm run clean:worktrees [-- flags]` — report on the agent worktrees under `.claude/worktrees/`
 * and, only with `--apply`, delete the SAFE ones (PR merged/closed, clean, nothing unpushed, idle,
 * not the current one). Rules and decisions: `scripts/lib/worktreeCleanup.mjs`, `.claude/rules/testing.md`.
 *
 *   (none)          report only; deletes nothing
 *   --apply         delete SAFE worktrees (+ their branch with `git branch -d`), orphan SAFE `claude/*` branches,
 *                   gate stamps > 14 d and test-output logs > 24 h
 *   --skip <name>   treat that worktree as a running session (repeatable)
 *   --idle-minutes <n>  activity window (default 30): a worktree whose git files changed more recently is kept
 *   --sizes         add the size of each worktree to the report (slow: walks every file)
 *   --fetch         `git fetch origin` first so merged PRs and `origin/dev` are current
 *   --summary       quiet: only refresh the summary file `npm run status` reads (SessionEnd hook)
 *
 * Never: `git branch -D`, remote branches, tags, globs, killing processes. UNSURE is never deleted.
 * Handoffs (gitignored `docs/*.md`) are copied to the main checkout's `docs/` and verified byte for byte first.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { staleStamps, isStampName } from './lib/gate.mjs'
import { git } from './lib/git.mjs'
import {
  classifyWorktree, formatReport, isManagedWorktree, parseWorktreeList, pickPr, planHandoffCopies, staleEntries,
  summarize,
} from './lib/worktreeCleanup.mjs'

const BASE = 'origin/dev'
const DAY_MS = 24 * 60 * 60 * 1000
const HEAVY_DIRS = ['.next', 'node_modules', 'test-results']
const PROTECTED_BRANCHES = new Set(['dev', 'main'])

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const summaryOnly = args.includes('--summary')
const withSizes = args.includes('--sizes')
const skip = new Set(args.flatMap((a, i) => (a === '--skip' && args[i + 1] ? [args[i + 1]] : [])))
const idleArg = args[args.indexOf('--idle-minutes') + 1]
const options = args.includes('--idle-minutes') && /^[0-9]+$/.test(idleArg) ? { activeMinutes: Number(idleArg) } : {}
const log = (...m) => (summaryOnly ? undefined : console.log(...m))

if (args.includes('--fetch')) git(['fetch', '--quiet', 'origin'])

const commonDir = path.resolve(git(['rev-parse', '--git-common-dir']) ?? '.git')
const mainRoot = path.dirname(commonDir).replace(/\\/g, '/')
const current = (git(['rev-parse', '--show-toplevel']) ?? '').replace(/\\/g, '/').toLowerCase()
const trees = parseWorktreeList(git(['worktree', 'list', '--porcelain']) ?? '')

function readPrs() {
  const r = spawnSync('gh', ['pr', 'list', '--state', 'all', '--limit', '500', '--json', 'number,state,headRefName,headRefOid'], {
    encoding: 'utf8', timeout: 20_000,
  })
  if (r.error || r.status !== 0) return null
  try { return JSON.parse(r.stdout) } catch { return null }
}
const prs = readPrs()

const count = (rev) => { const n = Number.parseInt(git(['rev-list', '--count', rev]) ?? '', 10); return Number.isNaN(n) ? null : n }
const isAncestor = (head) => git(['merge-base', '--is-ancestor', head, BASE]) !== null

const mtimeMs = (p) => { try { return statSync(p).mtimeMs } catch { return null } }

function idleMinutes(wtPath) {
  const gitDir = git(['-C', wtPath, 'rev-parse', '--absolute-git-dir'])
  if (!gitDir) return null
  // git files catch commits/checkouts; the worktree root and docs/ catch a session that only edits files (handoff, tests)
  const docs = path.join(wtPath, 'docs')
  const candidates = [path.join(gitDir, 'index'), path.join(gitDir, 'HEAD'), path.join(gitDir, 'logs/HEAD'), wtPath, docs]
  if (existsSync(docs)) candidates.push(...readdirSync(docs).map((n) => path.join(docs, n)))
  const times = candidates.map(mtimeMs).filter((t) => t !== null)
  return times.length === 0 ? null : (Date.now() - Math.max(...times)) / 60_000
}

function dirSizeMb(dir) {
  let bytes = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      try {
        if (e.isDirectory()) walk(p)
        else bytes += statSync(p).size
      } catch {}
    }
  }
  try { walk(dir) } catch {}
  return Math.round(bytes / 1_048_576)
}

function prFact(branch, head) {
  if (prs === null) return 'unavailable'
  return branch ? pickPr(prs, branch, head) : null
}

const rows = trees.flatMap((t) => {
  const isMain = path.resolve(t.path) === path.resolve(mainRoot)
  if (!isMain && !isManagedWorktree(mainRoot, t.path)) return []
  const name = path.basename(t.path)
  const base = { name, path: t.path, branch: t.branch }
  if (isMain) return [{ ...base, ...classifyWorktree(blank({ isMain: true })) }]
  const statusOut = git(['-C', t.path, 'status', '--porcelain'])
  const remoteHead = t.branch ? git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${t.branch}`]) : null
  const facts = {
    isCurrent: t.path.replace(/\\/g, '/').toLowerCase() === current,
    isMain: false,
    skipped: skip.has(name),
    idleMinutes: idleMinutes(t.path),
    // a failing `git status` (half-deleted dir) counts as dirty: never delete what we cannot read
    dirty: statusOut === null ? 1 : statusOut.split('\n').filter((l) => l.trim()).length,
    headInBase: isAncestor(t.head),
    uniqueCommits: count(`${BASE}..${t.head}`),
    pushed: remoteHead !== null && remoteHead === t.head,
    pr: prFact(t.branch, t.head),
  }
  const verdict = classifyWorktree(facts, options)
  if (t.locked && verdict.verdict === 'SAFE') return [{ ...base, verdict: 'KEEP', reasons: ['git-locked'] }]
  return [{ ...base, ...verdict, mb: withSizes ? dirSizeMb(t.path) : undefined }]
})

function blank(over) {
  return { isCurrent: false, isMain: false, skipped: false, idleMinutes: null, dirty: 0, headInBase: null, uniqueCommits: null, pushed: false, pr: null, ...over }
}

// Local branches without a worktree (sessions create claude/<name>, then the worktree moves to a feature branch).
const checkedOut = new Set(trees.map((t) => t.branch))
const orphanRows = (git(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads']) ?? '')
  .split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([b]) => !checkedOut.has(b) && !PROTECTED_BRANCHES.has(b))
  .map(([branch, head]) => {
    const remoteHead = git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${branch}`])
    const v = classifyWorktree(blank({
      headInBase: isAncestor(head),
      uniqueCommits: count(`${BASE}..${head}`),
      pushed: remoteHead === head,
      pr: prFact(branch, head),
    }), options)
    // a branch without any PR may be a session's fresh branch: report it, never delete it
    if (v.verdict === 'SAFE' && prFact(branch, head) === null) return { name: branch, branch, verdict: 'UNSURE', reasons: ['no PR (in origin/dev, but could be a fresh branch)'] }
    return { name: branch, branch, ...v }
  })

// Directories git no longer knows (a removal the app held open leaves them). Only EMPTY ones are ever removed (rmdir).
const registered = new Set(trees.map((t) => path.basename(t.path)))
const wtRoot = path.join(mainRoot, '.claude', 'worktrees')
const leftovers = existsSync(wtRoot)
  ? readdirSync(wtRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !registered.has(e.name)).map((e) => e.name)
  : []
const emptyLeftovers = leftovers.filter((n) => readdirSync(path.join(wtRoot, n)).length === 0)

const stampDir = commonDir
const stamps = staleStamps(
  readdirSync(stampDir).filter(isStampName).map((name) => ({ name, mtimeMs: mtimeMs(path.join(stampDir, name)) ?? Infinity })),
  Date.now(), 14 * DAY_MS,
)
const logDir = path.join(os.tmpdir(), 'claude-test-output')
const logs = existsSync(logDir)
  ? staleEntries(readdirSync(logDir).map((name) => ({ name, mtimeMs: mtimeMs(path.join(logDir, name)) ?? Infinity })), Date.now(), DAY_MS)
  : []

writeFileSync(path.join(commonDir, 'clean-worktrees-summary.json'), JSON.stringify(summarize(rows, Date.now())))
if (summaryOnly) process.exit(0)

log(formatReport(rows))
if (prs === null) log('\nwarning: gh unavailable — PR state unknown, nothing without HEAD in origin/dev can be SAFE')
if (orphanRows.length > 0) {
  const s = summarize(orphanRows, 0)
  log(`\nlocal branches without a worktree: ${orphanRows.length} (SAFE ${s.safe}, KEEP ${s.keep}, UNSURE ${s.unsure})`)
  for (const r of orphanRows.filter((x) => x.verdict !== 'SAFE')) log(`  ${r.verdict.padEnd(6)} ${r.name}  ${r.reasons.join('; ')}`)
}
log(`\nhousekeeping: ${stamps.length} gate stamps > 14 d, ${logs.length} test-output logs > 24 h`)
if (!apply) {
  log('\nreport only — nothing deleted. Delete the SAFE ones with: npm run clean:worktrees -- --apply')
  process.exit(0)
}

// ---- apply: SAFE only, explicit paths, everything verified before and reported after ----
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const docsOf = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((name) => ({ name, hash: sha(path.join(dir, name)) })) : [])

function removeTree(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    return true
  } catch {
    if (process.platform !== 'win32') return false
    // Windows fallback for paths past MAX_PATH: mirror an empty directory over it, then drop the shell
    const empty = mkdtempSync(path.join(os.tmpdir(), 'empty-'))
    spawnSync('robocopy', [empty, dir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'ignore' })
    rmSync(empty, { recursive: true, force: true })
    try { rmSync(dir, { recursive: true, force: true }); return true } catch { return false }
  }
}

function removeWorktree(row) {
  if (!isManagedWorktree(mainRoot, row.path)) return `refused: ${row.path} is not under .claude/worktrees/`
  // 1. rescue handoffs
  const wtDocs = path.join(row.path, 'docs')
  const mainDocs = path.join(mainRoot, 'docs')
  const plan = planHandoffCopies(docsOf(wtDocs), docsOf(mainDocs), row.name)
  if (plan.length > 0) mkdirSync(mainDocs, { recursive: true })
  for (const { from, to } of plan) {
    copyFileSync(path.join(wtDocs, from), path.join(mainDocs, to))
    if (!readFileSync(path.join(wtDocs, from)).equals(readFileSync(path.join(mainDocs, to)))) return `handoff copy mismatch: ${to} — worktree kept`
  }
  // 1b. gitignored files other than the known regenerable ones would be lost silently: keep the worktree instead
  const ignored = (git(['-C', row.path, 'status', '--porcelain', '--ignored']) ?? '').split('\n')
    .filter((l) => l.startsWith('!! ')).map((l) => l.slice(3).replace(/\/$/, ''))
    .filter((n) => ![...HEAVY_DIRS, 'docs', '.impeccable', 'next-env.d.ts'].includes(n) && !n.endsWith('.tsbuildinfo'))
  if (ignored.length > 0) return `other gitignored files (${ignored.join(', ')}) — copy them if needed, then delete the worktree by hand; kept`
  // 2. heavy dirs first (deep .next / node_modules paths are what breaks `git worktree remove` on Windows)
  for (const d of HEAVY_DIRS) {
    const p = path.join(row.path, d)
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) return `${d} is a link/junction — worktree kept (remove the link by hand)`
    if (existsSync(p) && !removeTree(p)) return `could not remove ${d} (locked?) — worktree kept`
  }
  // 3. let git remove it; only transient filesystem errors fall back to a plain delete + prune
  const r = spawnSync('git', ['worktree', 'remove', row.path], { encoding: 'utf8' })
  let note = r.status === 0 ? 'removed' : ''
  if (r.status !== 0) {
    if (!/too long|permission denied|busy|not empty/i.test(r.stderr)) return `git worktree remove failed: ${r.stderr.trim().split('\n')[0]}`
    note = removeTree(row.path) ? 'removed (fallback)' : 'dir left behind (locked by another process) — registration pruned'
    git(['worktree', 'prune'])
  }
  if (plan.length > 0) note += `, ${plan.length} handoff(s) → docs/ (${plan.map((p) => p.to).join(', ')})`
  return note
}

function deleteBranch(branch) {
  const r = spawnSync('git', ['branch', '-d', branch], { encoding: 'utf8' })
  return r.status === 0 ? 'branch deleted' : `branch kept (git branch -d: ${r.stderr.trim().split('\n')[0]})`
}

log('\n--apply:')
for (const row of rows.filter((r) => r.verdict === 'SAFE')) {
  const outcome = removeWorktree(row)
  const removed = outcome.startsWith('removed') || outcome.startsWith('dir left behind')
  log(`  ${row.name}: ${outcome}${removed && row.branch && !PROTECTED_BRANCHES.has(row.branch) ? `; ${deleteBranch(row.branch)}` : ''}`)
}
for (const row of orphanRows.filter((r) => r.verdict === 'SAFE')) log(`  branch ${row.name}: ${deleteBranch(row.name)}`)
for (const name of stamps) rmSync(path.join(stampDir, name), { force: true })
for (const name of logs) rmSync(path.join(logDir, name), { force: true })
for (const n of emptyLeftovers) {
  try { rmdirSync(path.join(wtRoot, n)) } catch (e) { log(`  leftover ${n}: not removed (${e.code})`) }
}
log(`  housekeeping: removed ${stamps.length} stamps, ${logs.length} logs`)
git(['worktree', 'prune'])
rmSync(path.join(commonDir, 'clean-worktrees-summary.json'), { force: true }) // stale after a delete; the next report rewrites it
