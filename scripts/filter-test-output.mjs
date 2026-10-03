// Stdin filter for the gate commands rewritten by `.claude/hooks/filter-test-output.mjs`:
// streams the raw output to a temp log, then prints only `filterTestOutput()`
// (scripts/lib/testOutputFilter.mjs). Always exits 0 — `set -o pipefail` in the
// rewritten command carries the gate's own exit code.
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { filterTestOutput } from './lib/testOutputFilter.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const dir = path.join(tmpdir(), 'claude-test-output')
let log = null
try {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    if (Date.now() - statSync(file).mtimeMs > DAY_MS) unlinkSync(file)
  }
  log = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.log`)
  appendFileSync(log, '')
} catch {
  log = null
}
// Printed first, so the path is visible even if the Bash tool times out mid-run.
process.stdout.write(`[filtered test output; full log: ${log ?? 'unavailable'}]\n`)

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) {
  raw += chunk
  if (log) {
    try {
      appendFileSync(log, chunk)
    } catch {
      log = null
    }
  }
}
let out
try {
  out = filterTestOutput(raw)
} catch {
  out = raw
}
process.stdout.write(out.endsWith('\n') || out === '' ? out : `${out}\n`)
