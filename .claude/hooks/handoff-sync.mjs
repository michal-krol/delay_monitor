// SessionEnd: copies this worktree's gitignored docs/*.md handoffs to the main checkout's docs/
// (AGENTS.md #11 — docs/ is not in git, a removed worktree takes them along). Copy only, idempotent,
// no-op outside .claude/worktrees/<name>. Logic and tests: scripts/lib/handoffs.mjs. Fails open.
import path from 'node:path'
import { git } from '../../scripts/lib/git.mjs'
import { syncHandoffs } from '../../scripts/lib/handoffs.mjs'
import { isManagedWorktree } from '../../scripts/lib/worktreeCleanup.mjs'

try {
  const dir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const top = git(['-C', dir, 'rev-parse', '--show-toplevel'])
  const common = git(['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (top !== null && common !== null) {
    const mainRoot = path.dirname(common)
    if (isManagedWorktree(mainRoot, top)) syncHandoffs({ wtPath: top, mainRoot, name: path.basename(top) })
  }
} catch {}
