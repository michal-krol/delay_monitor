/**
 * Thin process helpers shared by `scripts/check.mjs`, `pre-push.mjs` and
 * `status.mjs`. Windows needs a shell to find `npm.cmd` / `npx.cmd`.
 */
import { spawnSync } from 'node:child_process'

const shell = process.platform === 'win32'

/** Runs git and returns trimmed stdout, or null on any failure. */
export function git(args, env) {
  const r = spawnSync('git', args, { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Runs a command with inherited stdio; returns its exit code (1 when it could not start). */
export function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell })
  return r.status ?? 1
}
