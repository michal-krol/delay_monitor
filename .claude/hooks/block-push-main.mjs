// PreToolUse(Bash): blocks a `git push` without an explicit refspec while on `main`.
// Explicit `main` / `*:main` refspecs are covered by permissions.deny in settings.json.
import { execSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk
const command = JSON.parse(input).tool_input?.command ?? ''
const match = command.match(/^\s*git\s+push\b(.*)$/)
if (match) {
  const positional = match[1].trim().split(/\s+/).filter((a) => a && !a.startsWith('-'))
  let branch = ''
  try { branch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
  if (positional.length <= 1 && branch === 'main') {
    console.error('Blocked: git push from main without a refspec would update main (AGENTS.md #12).')
    process.exit(2)
  }
}
