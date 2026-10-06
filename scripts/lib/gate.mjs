/**
 * Pure decisions for the quality-gate stamp (`scripts/check.mjs`) and the
 * pre-push hook (`scripts/pre-push.mjs`) — AGENTS.md #12, `.claude/rules/testing.md`.
 *
 * A green `npm run check` leaves `<git common dir>/gate-ok-<tree>`; the tree
 * hash names exactly the content that was checked, so a push whose commit has
 * that tree can skip re-running the gate. Separately, a push whose range
 * touches `src/app/**` runs `next build`, because tsc does not see Next's
 * route/page export rules.
 */

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const ZERO = /^0+$/
const STAMP_PREFIX = 'gate-ok-'

/** @param {string} tree full tree hash from `git write-tree` / `git rev-parse <sha>^{tree}` */
export function stampName(tree) {
  if (!HASH.test(tree)) throw new Error(`not a tree hash: ${JSON.stringify(tree)}`)
  return STAMP_PREFIX + tree
}

/** @param {string} name */
export function isStampName(name) {
  return name.startsWith(STAMP_PREFIX) && HASH.test(name.slice(STAMP_PREFIX.length))
}

/**
 * @param {{ name: string, mtimeMs: number }[]} entries files in the git common dir
 * @param {number} now
 * @param {number} maxAgeMs
 * @returns {string[]} stamp files to delete
 */
export function staleStamps(entries, now, maxAgeMs) {
  return entries.filter((e) => isStampName(e.name) && now - e.mtimeMs > maxAgeMs).map((e) => e.name)
}

/**
 * Lines git feeds the pre-push hook on stdin (githooks(5)):
 * `<local ref> <local sha> <remote ref> <remote sha>`. Deletions (local sha of
 * zeros) push no content and are dropped; a new remote branch gets `remoteSha: null`.
 *
 * @param {string} text
 * @returns {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string | null }[]}
 */
export function parsePrePushInput(text) {
  return text.split('\n').flatMap((line) => {
    const parts = line.trim().split(/\s+/)
    if (parts.length !== 4) return []
    const [localRef, localSha, remoteRef, remoteSha] = parts
    if (!HASH.test(localSha) || !HASH.test(remoteSha) || ZERO.test(localSha)) return []
    return [{ localRef, localSha, remoteRef, remoteSha: ZERO.test(remoteSha) ? null : remoteSha }]
  })
}

/**
 * Candidate starts of the pushed range, best first: the remote tip for an
 * existing branch (may be missing locally after someone else's push), then
 * the merge base with the integration branch.
 *
 * @param {{ remoteSha: string | null }} update
 * @param {string | null} mergeBase
 * @returns {string[]}
 */
export function diffBases(update, mergeBase) {
  return [update.remoteSha, mergeBase].filter((sha) => sha !== null && sha !== undefined)
}

/** @param {string[]} paths repo-relative, forward slashes (`git diff --name-only`) */
export function touchesAppDir(paths) {
  return paths.some((p) => p.startsWith('src/app/'))
}

/**
 * @param {{ stamped: boolean, changedFiles: string[] | null }[]} updates
 *   one per pushed ref; `changedFiles: null` = range unknown (build to be safe)
 * @returns {{ runCheck: boolean, runBuild: boolean }}
 */
export function planPrePush(updates) {
  return {
    runCheck: updates.some((u) => !u.stamped),
    runBuild: updates.some((u) => u.changedFiles === null || touchesAppDir(u.changedFiles)),
  }
}
