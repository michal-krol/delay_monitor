## What & why

<!-- 1-2 sentences: the problem and the fix -->

## Acceptance criteria

<!-- plan-verifier table: Task | Criterion | Evidence | Verdict. Trivial change: "n/a — trivial". -->

## Definition of Done

- [ ] `npm run check` green locally (whole suite)
- [ ] `TZ=UTC npm run test` (if touching time logic — AGENTS.md #1)
- [ ] `npm run e2e` (if touching UI — AGENTS.md #16)
- [ ] `PKP_CONTRACT=1` / `GTFS_CONTRACT=1` (if touching schema/client)
- [ ] New behaviour has tests; every fixed bug has a regression test (failed before the fix)
- [ ] Acceptance criteria all PASS by an independent verifier (`plan-verifier` / Codex)
- [ ] Review: `/code-review <level>` + `/simplify` or `/ponytail-review` [+ `/security-review`] — findings fixed or justified below
- [ ] UI verified in the browser and on the `dev` deploy
- [ ] Any AGENTS.md invariant bent? (say why)
- [ ] CHANGELOG / README / AGENTS.md / `.claude/rules` consistent with the change
