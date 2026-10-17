---
name: cleanup
description: Clean up agent worktrees, merged local branches and temp data for delay_monitor. Use when the user says "cleanup", "sprzątanie", "posprzątaj worktree", after a PR merged, or when `npm run status` shows "worktrees: N ready to clean up".
---

# Worktree cleanup (delay_monitor)

Sessions run in parallel worktrees under `.claude/worktrees/` (300–1200 MB each: `.next`,
`test-results`, sometimes `node_modules`). Nothing removes them after a squash merge — this skill does,
through `scripts/clean-worktrees.mjs` (`npm run clean:worktrees`). Logic and tests:
`scripts/lib/worktreeCleanup.mjs`. Decisions: the script reports first and deletes only SAFE ones.

## Steps

1. **Report** (deletes nothing). Run from any checkout; pass `--skip <name>` for every worktree whose
   session is still running (`mcp__ccd_session_mgmt__list_sessions` `{"linked": true}` lists them):
   ```bash
   npm run clean:worktrees -- --fetch --skip <running-name>
   ```
   Read the verdicts: SAFE (PR merged/closed or HEAD already in `origin/dev`, clean, pushed, idle ≥ 30 min,
   not current), KEEP (open PR, dirty, unpushed, no PR with unique commits, current, running), UNSURE (cannot tell).
2. **Show the user the SAFE list** (names + PR) and ask before deleting. UNSURE and KEEP are never deleted by the
   script; decide those with the user one by one (look at `git -C <path> log origin/dev..HEAD`).
3. **Apply**:
   ```bash
   npm run clean:worktrees -- --fetch --skip <running-name> --apply
   ```
   Per SAFE worktree: gitignored `docs/*.md` handoffs are copied to the main checkout's `docs/` and compared byte for
   byte (name collision with different content → suffix `-<worktree>`), then `.next`/`node_modules`/`test-results`
   go first (deep paths break `git worktree remove` on Windows), then `git worktree remove`, `git worktree prune`
   and `git branch -d` (never `-D`: a squash-merged branch reports "not merged" and stays — say so, don't force it).
   Also removed: gate stamps > 14 d, `$TMPDIR/claude-test-output` logs > 24 h, empty unregistered dirs.
4. A dir left behind ("locked by another process") is the app holding a session folder open; it disappears
   after the app closes that session — run the cleanup again later, never kill processes.

## Never

`git branch -D`, remote branches, tags, globs in delete paths, `taskkill`/`pkill node`, the current worktree, a
worktree with a running session, anything the report did not mark SAFE.
