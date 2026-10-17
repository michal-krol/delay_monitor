/**
 * Copies a worktree's gitignored `docs/*.md` handoffs to the main checkout's `docs/` (AGENTS.md #11:
 * `docs/` is not in git, so a removed worktree takes them along). Copy only — nothing is deleted —
 * and idempotent: content already in main is skipped, a name clash with different content gets the
 * worktree name as suffix. Each copy is compared byte for byte. Used by the SessionEnd hook
 * (`.claude/hooks/handoff-sync.mjs`) and by `scripts/clean-worktrees.mjs` before it deletes a worktree.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { planHandoffCopies } from './worktreeCleanup.mjs'

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

function docsOf(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md') && statSync(path.join(dir, name)).isFile())
    .map((name) => ({ name, hash: sha(path.join(dir, name)) }))
}

/**
 * @param {{ wtPath: string, mainRoot: string, name: string }} args
 * @returns {{ copied: { from: string, to: string }[], error: string | null }}
 */
export function syncHandoffs({ wtPath, mainRoot, name }) {
  const wtDocs = path.join(wtPath, 'docs')
  const mainDocs = path.join(mainRoot, 'docs')
  const plan = planHandoffCopies(docsOf(wtDocs), docsOf(mainDocs), name)
  if (plan.length > 0) mkdirSync(mainDocs, { recursive: true })
  const copied = []
  for (const { from, to } of plan) {
    copyFileSync(path.join(wtDocs, from), path.join(mainDocs, to))
    if (!readFileSync(path.join(wtDocs, from)).equals(readFileSync(path.join(mainDocs, to)))) {
      return { copied, error: `handoff copy mismatch: ${to}` }
    }
    copied.push({ from, to })
  }
  return { copied, error: null }
}
