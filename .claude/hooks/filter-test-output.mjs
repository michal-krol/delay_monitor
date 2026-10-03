// PreToolUse(Bash): rewrites a plain `npm run check` / `npm test` / `npx vitest run` /
// `npm run e2e` / `npx playwright test` to pipe its output through
// scripts/filter-test-output.mjs (failures + summaries only; token audit 2026-10-03, Q5).
// Logic and tests: scripts/lib/testOutputFilter.mjs. Runs in parallel with the other
// PreToolUse hooks, which see the original command. Fails open: no rewrite on bad input.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHookOutput } from '../../scripts/lib/testOutputFilter.mjs'

const filterScript = fileURLToPath(new URL('../../scripts/filter-test-output.mjs', import.meta.url))

let input = ''
for await (const chunk of process.stdin) input += chunk
let output = null
try {
  output = buildHookOutput(JSON.parse(input), { filterScript: path.normalize(filterScript) })
} catch {}
if (output) process.stdout.write(JSON.stringify(output))
