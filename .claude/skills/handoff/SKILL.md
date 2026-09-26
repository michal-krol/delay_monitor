---
name: handoff
description: Write the end-of-session handoff note for delay_monitor. Use when the user asks for a "handoff", "nahdoff", "handoff sesji", "podsumuj sesję do handoffu", or at the end of a substantial working session.
---

# Session handoff (delay_monitor)

## Where

- `E:\Claude_Code\delay_monitor\docs\session-handoffYYYYMMDD.md` — the **main checkout**, even
  when working in a worktree (`docs/` is gitignored, AGENTS.md #11, so worktrees have no copy).
- Today's date, no separators. A second handoff on the same day: suffix `b`
  (`session-handoff20260901b.md`).
- Find the previous one: newest `session-handoff*.md` in that directory.

## Format (Polish — human-facing doc)

1. Opening paragraph — state: date, `dev` head SHA and push status, `main`/production status,
   which worktree/branch the work happened in.
2. **Jak z tego korzystać** — the file's role (narrative, not a duplicate of README/CHANGELOG)
   + the previous handoff's file name for continuity.
3. Numbered sections narrating what happened: decisions made (and why), real bugs found with
   root cause in enough detail to understand why, things deliberately deferred and why.
   For a production incident add a mini post-mortem: symptom / cause / why tests missed it /
   which gate catches it now.
4. **Testy i weryfikacja** — final quality-gate state (commands run, results).
5. **Otwarte wątki (czekają na decyzję)** — open items for the next session.

Each handoff stands alone as the entry point for "what happened since the last one": link the
previous file, don't require reading the whole chain.

## Gather facts first

```bash
git -C E:/Claude_Code/delay_monitor log --oneline -1 origin/dev
git -C E:/Claude_Code/delay_monitor log --oneline -1 origin/main
gh pr list --state open
```

After writing, update memory only for durable facts (decisions, constraints) — not the narrative.
