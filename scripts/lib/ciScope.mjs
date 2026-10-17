/**
 * Which CI jobs a change needs. Only the browser suite is conditional: `e2e` builds the app and
 * drives it in three browsers, so a PR that touches nothing the built app or the suite reads
 * (docs, agent rules, dev scripts, hooks, unit tests) skips it. It is an ALLOWLIST of files that
 * cannot affect the build — an unknown file runs the suite. `quality` (typecheck, lint, unit
 * tests) always runs. Used by `scripts/ci-scope.mjs` in the `changes` job of `ci.yml`.
 */

const SKIPPABLE = [
  /\.md$/,
  /^(adr|docs|scripts|\.claude|\.githooks)\//,
  /^LICENSE$/,
  /\.test\.(ts|tsx|mjs)$/,
  /^\.github\/workflows\/(claude-review|contract|health)\.yml$/,
  /^\.github\/(dependabot\.yml|ISSUE_TEMPLATE\/)/,
]

/**
 * @param {string[] | null | undefined} changedFiles repo-relative paths of the PR; null/empty = unknown
 * @returns {boolean} true when the e2e matrix must run
 */
export function needsE2e(changedFiles) {
  if (!changedFiles || changedFiles.length === 0) return true
  return changedFiles.some((file) => {
    const f = file.replaceAll('\\', '/')
    return !SKIPPABLE.some((pattern) => pattern.test(f))
  })
}
