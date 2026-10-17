---
paths:
  - "scripts/clean-worktrees.mjs"
  - "scripts/lib/worktreeCleanup*"
  - "scripts/lib/handoffs*"
  - ".claude/hooks/**"
  - ".claude/skills/**"
---

# Worktree cleanup and handoffs (`scripts/clean-worktrees.mjs`, skill `cleanup`)

Measured 2026-10-17: 34 worktrees under `.claude/worktrees/` = 15.2 GB, 32 stale (PR merged). Each is 300–600 MB
(`.next`, `test-results`; `node_modules` in 4 of them — most likely branches that change the lockfile and need
`npm ci` in the worktree (`deps:check` above); not verified per worktree); 4 were > 1.1 GB. `git worktree remove` failed on 13 ("Filename too long" in deep
`.next`/`node_modules`, "Permission denied"/"busy" while the Claude app held the folder).

- `npm run clean:worktrees` = report; `-- --apply` deletes SAFE only. Classifier = `scripts/lib/worktreeCleanup.mjs`
  (tested): signal is the PR (`gh pr list --state all`) plus "remote branch == local HEAD / HEAD in `origin/dev`" —
  never `git branch -d` / `merge-base --is-ancestor` alone, squash merges make both say "not merged".
- KEEP: current worktree, `--skip <name>` (running session), git-locked, git files touched < 30 min ago
  (`--idle-minutes`), dirty tree, open PR, no PR with unique commits, unpushed commits. UNSURE (gh down, no PR and
  unknown) is reported, never deleted.
- Removal order: copy gitignored `docs/*.md` to the main checkout's `docs/` (verified; AGENTS.md #11), delete
  `.next`/`node_modules`/`test-results`, `git worktree remove` (a "modified or untracked files" refusal is respected;
  only path-length/lock errors fall back to a plain delete + `git worktree prune`), `git branch -d` (never `-D`).
  Only `.claude/worktrees/<name>` paths pass `isManagedWorktree()`.
- Also: gate stamps > 14 d, `$TMPDIR/claude-test-output` logs > 24 h, empty unregistered dirs (`rmdir`, never recursive).
- Triggers: on demand (skill `cleanup`), a nudge line in `npm run status` read from
  `<git common dir>/clean-worktrees-summary.json`, and two SessionEnd hooks: `worktrees-report.mjs` (refreshes that
  summary only) and `handoff-sync.mjs` (copies the session worktree's gitignored `docs/*.md` to the main checkout's
  `docs/` — copy only, idempotent, collision suffix, `scripts/lib/handoffs.mjs`). Nothing deletes without `--apply`.
  A handoff written after the session ended is not copied by the hook; `--apply` rescues it before removal.
- Cheaper footprint: `next dev` no longer rewrites `AGENTS.md` (`agentRules: false`, guarded in `next.config.test.ts`).
  Per-worktree `.next` (webpack e2e build, ~300 MB) is the main cost; sharing it was not attempted
  (each worktree builds its own tree), so it goes with the worktree.
