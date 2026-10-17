// SessionEnd: refreshes the worktree summary that `npm run status` turns into a one-line nudge
// (scripts/clean-worktrees.mjs --summary). Report only — it never deletes anything. Fails open.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/clean-worktrees.mjs')
spawnSync(process.execPath, [script, '--summary'], { stdio: 'ignore', timeout: 25_000 })
