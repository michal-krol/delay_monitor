## What & why

<!-- 1-2 sentences: the problem and the fix -->

## Checklist

- [ ] `npm run check` green locally
- [ ] `TZ=UTC npm run test` (if touching time logic — AGENTS.md #1)
- [ ] `npm run e2e` (if touching UI — AGENTS.md #16)
- [ ] `PKP_CONTRACT=1` / `GTFS_CONTRACT=1` (if touching schema/client)
- [ ] UI verified in the browser and on the `dev` deploy
- [ ] New behaviour has tests
- [ ] Any AGENTS.md invariant bent? (say why)
- [ ] CHANGELOG updated (if user-facing)
