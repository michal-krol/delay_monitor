/**
 * Pure parsing/formatting for `npm run status` (`scripts/status.mjs`): one
 * call instead of separate `git log` / `git status` / `gh pr view` round trips.
 */

/** @param {string} out `git rev-list --left-right --count <base>...HEAD` */
export function parseAheadBehind(out) {
  const m = /^(\d+)\s+(\d+)\s*$/.exec(out)
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null
}

/** @param {string} out `git status --porcelain` */
export function parsePorcelain(out) {
  return out.split('\n').filter((line) => line.trim() !== '')
}

const OK_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const PENDING_STATES = new Set(['PENDING', 'EXPECTED'])

/**
 * `statusCheckRollup` from `gh pr view --json statusCheckRollup`: CheckRun
 * items (`status`/`conclusion`) and commit StatusContext items (`state`).
 *
 * @param {Array<{ __typename?: string, name?: string, context?: string, status?: string, conclusion?: string | null, state?: string }> | undefined} rollup
 */
export function summarizeChecks(rollup) {
  const items = rollup ?? []
  const failing = []
  const pending = []
  for (const item of items) {
    const name = item.name ?? item.context ?? '?'
    if (item.__typename === 'StatusContext') {
      if (PENDING_STATES.has(item.state)) pending.push(name)
      else if (item.state !== 'SUCCESS') failing.push(name)
    } else if (item.status !== 'COMPLETED') {
      pending.push(name)
    } else if (!OK_CONCLUSIONS.has(item.conclusion ?? '')) {
      failing.push(name)
    }
  }
  const state = items.length === 0 ? 'none' : failing.length > 0 ? 'fail' : pending.length > 0 ? 'pending' : 'pass'
  return { state, total: items.length, failing, pending }
}

/**
 * @param {{
 *   branch: string, head: string, base: string,
 *   aheadBehind: { ahead: number, behind: number } | null,
 *   dirty: string[],
 *   pr: { number: number, state: string, checks: ReturnType<typeof summarizeChecks> } | { none: true } | { error: string },
 * }} facts
 */
export function formatStatus({ branch, head, base, aheadBehind, dirty, pr }) {
  const lines = [`branch: ${branch}`, `HEAD:   ${head}`]
  lines.push(
    aheadBehind
      ? `vs ${base}: ahead ${aheadBehind.ahead}, behind ${aheadBehind.behind}`
      : `vs ${base}: unknown (ref missing — git fetch ${base.replace('/', ' ')})`,
  )
  lines.push(dirty.length === 0 ? 'dirty:  none' : [`dirty:  ${dirty.length} files`, ...dirty.map((d) => `  ${d}`)].join('\n'))
  lines.push(`PR:     ${formatPr(pr)}`)
  return lines.join('\n')
}

function formatPr(pr) {
  if ('error' in pr) return `unavailable (${pr.error})`
  if ('none' in pr) return 'none for this branch'
  const { checks } = pr
  let text = `#${pr.number} ${pr.state}, CI ${checks.state}`
  if (checks.total > 0) text += ` (${checks.total} checks)`
  const details = [
    checks.failing.length > 0 && `failing: ${checks.failing.join(', ')}`,
    checks.pending.length > 0 && `pending: ${checks.pending.join(', ')}`,
  ].filter(Boolean)
  return details.length > 0 ? `${text} — ${details.join('; ')}` : text
}
