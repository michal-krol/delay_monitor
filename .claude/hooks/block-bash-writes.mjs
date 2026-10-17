// PreToolUse(Bash): in subagents, blocks file writes through Bash (redirection, tee, sed -i,
// perl -i, awk, patch / git apply, node/python/perl/ruby/PowerShell code with write APIs) and
// git stash / reset / restore / checkout -- <path> (AGENTS.md #15). Logic and tests:
// scripts/lib/bashGuard.mjs. Fails open on unreadable input — it is a guard, not a sandbox.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { evaluateHookInput } from '../../scripts/lib/bashGuard.mjs'

let input = ''
for await (const chunk of process.stdin) input += chunk
let result = { blocked: false }
try {
  const readFile = (file) => readFileSync(file, 'utf8')
  result = evaluateHookInput(JSON.parse(input), { env: process.env, tmpdir: tmpdir(), readFile })
} catch {}
if (result.blocked) {
  console.error(result.reason)
  process.exit(2)
}
