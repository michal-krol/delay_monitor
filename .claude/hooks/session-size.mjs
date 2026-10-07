// UserPromptSubmit: warns (as added context) once the session passes 150 turns or 300k tokens of
// context (AGENTS.md #15). Logic and tests: scripts/lib/sessionSize.mjs. Fails open — advice only.
import { readFileSync } from 'node:fs'
import { measureSession, sessionWarning } from '../../scripts/lib/sessionSize.mjs'

let input = ''
for await (const chunk of process.stdin) input += chunk
try {
  const { transcript_path } = JSON.parse(input)
  const warning = sessionWarning(measureSession(readFileSync(transcript_path, 'utf8')))
  if (warning) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: warning } }))
  }
} catch {}
