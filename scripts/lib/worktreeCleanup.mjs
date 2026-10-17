/**
 * Pure decisions for `npm run clean:worktrees` (`scripts/clean-worktrees.mjs`): which agent
 * worktrees under `.claude/worktrees/` are safe to delete, which handoffs to rescue first, and
 * the report text. No IO here — the script gathers facts and executes the plan.
 *
 * Squash merges make `git branch -d` / `merge-base --is-ancestor` lie ("not merged"), so the
 * signal is the PR (`gh`) plus "local HEAD is what the remote has / what the PR merged".
 */

/** A worktree whose git admin files changed more recently is treated as a running session. */
export const ACTIVE_MINUTES = 30

/**
 * @typedef {{ state: 'OPEN' | 'MERGED' | 'CLOSED', headMatches: boolean }} PrFact
 * @typedef {{
 *   isCurrent: boolean, isMain: boolean, skipped: boolean,
 *   idleMinutes: number | null, dirty: number,
 *   headInBase: boolean | null, uniqueCommits: number | null, pushed: boolean,
 *   pr: PrFact | null | 'unavailable',
 * }} WorktreeFacts
 * `pr: null` = no PR for the branch, `'unavailable'` = gh failed. `pushed` = remote branch == local HEAD.
 */

/**
 * SAFE = nothing is lost by deleting; KEEP = something would be lost or the worktree is in use;
 * UNSURE = cannot tell (report only, never deleted). Safety checks run first, in order.
 *
 * @param {WorktreeFacts} f
 * @param {{ activeMinutes?: number }} [options] `--idle-minutes` of the script
 * @returns {{ verdict: 'SAFE' | 'KEEP' | 'UNSURE', reasons: string[] }}
 */
export function classifyWorktree(f, { activeMinutes = ACTIVE_MINUTES } = {}) {
  const keep = (reason) => ({ verdict: 'KEEP', reasons: [reason] })
  if (f.isMain) return keep('main checkout')
  if (f.isCurrent) return keep('current worktree')
  if (f.skipped) return keep('session running (--skip)')
  if (f.idleMinutes !== null && f.idleMinutes < activeMinutes) {
    return keep(`active ${Math.round(f.idleMinutes)} min ago`)
  }
  if (f.dirty > 0) return keep(`dirty tree (${f.dirty} files)`)
  if (f.pr !== null && f.pr !== 'unavailable' && f.pr.state === 'OPEN') return keep('open PR')

  const headSafe = f.headInBase === true || f.pushed || (f.pr !== null && f.pr !== 'unavailable' && f.pr.headMatches)
  if (f.pr !== null && f.pr !== 'unavailable') {
    return headSafe
      ? { verdict: 'SAFE', reasons: [`PR ${f.pr.state.toLowerCase()}, HEAD pushed`] }
      : keep('unpushed commits')
  }
  if (f.headInBase === true) return { verdict: 'SAFE', reasons: ['HEAD already in origin/dev'] }
  if (f.pr === null && f.uniqueCommits !== null && f.uniqueCommits > 0) {
    return keep(`no PR, ${f.uniqueCommits} unique commits`)
  }
  return { verdict: 'UNSURE', reasons: [f.pr === 'unavailable' ? 'gh unavailable, HEAD not in origin/dev' : 'no PR, cannot tell'] }
}

/**
 * `git worktree list --porcelain`.
 *
 * @param {string} text
 * @returns {{ path: string, head: string, branch: string | null, detached: boolean, locked: boolean }[]}
 */
export function parseWorktreeList(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).filter(Boolean))
    .filter((lines) => lines.some((l) => l.startsWith('worktree ')))
    .map((lines) => {
      const find = (key) => lines.find((l) => l === key || l.startsWith(`${key} `))
      return {
        path: find('worktree').slice('worktree '.length),
        head: find('HEAD')?.slice('HEAD '.length) ?? '',
        branch: find('branch')?.slice('branch refs/heads/'.length) ?? null,
        detached: find('detached') !== undefined,
        locked: find('locked') !== undefined,
      }
    })
}

const normalize = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * Deletion guard: only `<main>/.claude/worktrees/<name>`, exactly one level, no `..`.
 *
 * @param {string} mainRoot
 * @param {string} wtPath
 */
export function isManagedWorktree(mainRoot, wtPath) {
  const prefix = `${normalize(mainRoot)}/.claude/worktrees/`.toLowerCase()
  const p = normalize(wtPath)
  if (!p.toLowerCase().startsWith(prefix)) return false
  const rest = p.slice(prefix.length)
  return rest !== '' && !rest.includes('/') && rest !== '.' && rest !== '..'
}

/**
 * The PR that decides a branch's fate, from one `gh pr list --state all` payload: open first, then
 * the one whose head is our HEAD, then merged over closed.
 *
 * @param {{ number: number, state: string, headRefName: string, headRefOid: string }[]} list
 * @param {string} branch
 * @param {string} head local HEAD sha
 * @returns {{ number: number, state: 'OPEN' | 'MERGED' | 'CLOSED', headMatches: boolean } | null}
 */
export function pickPr(list, branch, head) {
  const rank = (pr) => (pr.state === 'OPEN' ? 0 : 1) * 4 + (pr.headRefOid === head ? 0 : 2) + (pr.state === 'MERGED' ? 0 : 1)
  const [best] = list.filter((pr) => pr.headRefName === branch).sort((a, b) => rank(a) - rank(b))
  return best ? { number: best.number, state: best.state, headMatches: best.headRefOid === head } : null
}

/**
 * Which gitignored `docs/*.md` of a worktree must be copied to the main checkout before it goes
 * (AGENTS.md #11: `docs/` is not in git). Same content already in main = skip; same name with
 * different content = suffix with the worktree name (`-2`, `-3`… if that is taken as well).
 *
 * @param {{ name: string, hash: string }[]} wtFiles
 * @param {{ name: string, hash: string }[]} mainFiles
 * @param {string} wtName
 * @returns {{ from: string, to: string }[]}
 */
export function planHandoffCopies(wtFiles, mainFiles, wtName) {
  const hashes = new Set(mainFiles.map((f) => f.hash))
  const names = new Set(mainFiles.map((f) => f.name))
  const plan = []
  for (const file of wtFiles) {
    if (hashes.has(file.hash)) continue
    const dot = file.name.lastIndexOf('.')
    const stem = dot === -1 ? file.name : file.name.slice(0, dot)
    const ext = dot === -1 ? '' : file.name.slice(dot)
    let to = file.name
    for (let n = 1; names.has(to); n++) to = `${stem}-${wtName}${n > 1 ? `-${n}` : ''}${ext}`
    names.add(to)
    hashes.add(file.hash)
    plan.push({ from: file.name, to })
  }
  return plan
}

/**
 * @param {{ name: string, mtimeMs: number }[]} entries
 * @param {number} now
 * @param {number} maxAgeMs
 * @returns {string[]} names strictly older than the limit
 */
export function staleEntries(entries, now, maxAgeMs) {
  return entries.filter((e) => now - e.mtimeMs > maxAgeMs).map((e) => e.name)
}

/** @param {{ verdict: string }[]} rows */
export function summarize(rows, at) {
  const count = (v) => rows.filter((r) => r.verdict === v).length
  return { at, safe: count('SAFE'), keep: count('KEEP'), unsure: count('UNSURE') }
}

/** One status line, or null when there is nothing to clean. @param {{ safe: number }} s */
export function formatNudge(s) {
  return s.safe > 0 ? `worktrees: ${s.safe} ready to clean up — npm run clean:worktrees` : null
}

const ORDER = { SAFE: 0, UNSURE: 1, KEEP: 2 }

/** @param {{ name: string, branch: string | null, verdict: string, reasons: string[], mb?: number }[]} rows */
export function formatReport(rows) {
  const sorted = [...rows].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || a.name.localeCompare(b.name))
  const lines = sorted.map(
    (r) => `${r.verdict.padEnd(6)} ${r.name}  [${r.branch ?? 'detached'}]  ${r.reasons.join('; ')}${r.mb === undefined ? '' : `  ${r.mb} MB`}`,
  )
  const s = summarize(rows, 0)
  lines.push('', `SAFE: ${s.safe}, KEEP: ${s.keep}, UNSURE: ${s.unsure}`)
  return lines.join('\n')
}
