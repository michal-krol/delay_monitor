/**
 * Output filter for the gate commands (token audit 2026-10-03, Q5): the
 * PreToolUse(Bash) hook `.claude/hooks/filter-test-output.mjs` rewrites
 * `npm run check` / `npm test` / `npx vitest run` / `npm run e2e` /
 * `npx playwright test` so their output goes through
 * `scripts/filter-test-output.mjs`, which prints only what `filterTestOutput()`
 * keeps: failing test names, assertion lines, tsc/eslint errors and the final
 * summaries. The full log stays in a temp file.
 *
 * Line-based over the real tsc (`--noEmit`, non-TTY), eslint (stylish),
 * Vitest 5 and Playwright `list` outputs captured in `fixtures/test-output/`.
 * Unknown output falls back to its tail, so a format change loses detail, not
 * the result.
 */

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const FALLBACK_TAIL = 60

// npm step header `> delay_monitor@1.1.0 typecheck` (the command echo below it is dropped).
const NPM_STEP = /^> \S+@\S+ \S+$/
const VITEST_SUMMARY = /^\s*(Test Files|Tests|Errors|Type Errors)\s{2,}\S/
const VITEST_SECTION = /^⎯+ (.+?) ⎯+$/
const VITEST_SEPARATOR = /^⎯+(\[\d+\/\d+\]⎯)?$/
const VITEST_FAIL = /^ FAIL {1,2}\S/
const CONSOLE_ECHO = /^(stdout|stderr) \| /
const PW_FAILURE = /^\s+\d+\) \[[^\]]+\] › /
const PW_SUMMARY = /^\s+\d+ (failed|flaky|passed|skipped|did not run|interrupted)\b/
const PW_LISTED = /^\s+\[[^\]]+\] › /
const PW_RETRY = /^\s+Retry #\d+ ─/
const TSC_ERROR = /^\S.*(\(\d+,\d+\): |:\d+:\d+ - )error TS\d+:/
const TSC_FOUND = /^Found \d+ errors? in /
const ESLINT_FILE = /^(\/|[A-Za-z]:[\\/]).*\.[cm]?[jt]sx?$/
const ESLINT_PROBLEM = /^\s+\d+:\d+\s+(error|warning)\s/
const ESLINT_TOTAL = /^(✖ \d+ problems? \(|\s+\d+ errors? and \d+ warnings? potentially fixable)/
const GENERIC_ERROR = /^(npm (error|ERR!) |\w*Error: |Error \[)/
const CODE_FRAME = /^\s*>?\s*\d+\s*\|( |$)|^\s+\|\s*\^/
const STACK_FRAME = /^\s+at |^\s*❯ .*node_modules/

/**
 * @param {string} raw combined stdout+stderr of one gate command
 * @param {{ maxBlockLines?: number }} [options] cap per failure block (DOM dumps, call logs)
 * @returns {string}
 */
export function filterTestOutput(raw, { maxBlockLines = 20 } = {}) {
  const input = raw.replace(ANSI, '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd())
  const out = []
  let signal = false
  /** @type {null | { kind: 'vitest' | 'pw' | 'tsc' | 'eslint' | 'console' | 'skip', kept: number, omitted: number }} */
  let block = null

  const keep = (line) => out.push(line)
  const endBlock = () => {
    if (block?.omitted) keep(`… ${block.omitted} more lines`)
    block = null
  }
  const startBlock = (kind, header) => {
    endBlock()
    block = { kind, kept: 0, omitted: 0 }
    if (header !== undefined) keep(header)
    signal = true
  }
  const keepInBlock = (line) => {
    if (block.kept < maxBlockLines - 1) {
      keep(line)
      block.kept += 1
    } else {
      block.omitted += 1
    }
  }

  for (const line of input) {
    // Headers and summaries end any block and are always kept.
    if (NPM_STEP.test(line)) {
      endBlock()
      keep(line)
    } else if (VITEST_SUMMARY.test(line) || PW_SUMMARY.test(line) || TSC_FOUND.test(line) || ESLINT_TOTAL.test(line)) {
      endBlock()
      keep(line)
      signal = true
    } else if (PW_LISTED.test(line) && !block) {
      keep(line.replace(/\s*─+$/, ''))
    } else if (VITEST_FAIL.test(line)) {
      startBlock('vitest', line)
    } else if (PW_FAILURE.test(line)) {
      startBlock('pw', line.replace(/\s*─+$/, ''))
    } else if (TSC_ERROR.test(line)) {
      startBlock('tsc', line)
    } else if (ESLINT_FILE.test(line)) {
      startBlock('eslint', line)
    } else if (VITEST_SEPARATOR.test(line)) {
      endBlock()
    } else if (VITEST_SECTION.test(line)) {
      // `Failed Tests 3`, `Unhandled Errors`: the latter has no FAIL header of its own.
      startBlock('vitest', `⎯⎯ ${line.match(VITEST_SECTION)[1]} ⎯⎯`)
    } else if (CONSOLE_ECHO.test(line)) {
      // `stdout | file > test` echoes console output until the next blank line.
      endBlock()
      block = { kind: 'console', kept: 0, omitted: 0 }
    } else if (!block) {
      if (GENERIC_ERROR.test(line)) {
        keep(line)
        signal = true
      }
    } else if (block.kind === 'console') {
      if (line === '') block = null
    } else if (block.kind === 'skip') {
      // Playwright retry details repeat the first attempt.
    } else if (block.kind === 'pw' && PW_RETRY.test(line)) {
      endBlock()
      block = { kind: 'skip', kept: 0, omitted: 0 }
    } else if (block.kind === 'tsc') {
      if (/^\s+\S/.test(line)) keepInBlock(line)
      else endBlock()
    } else if (block.kind === 'eslint') {
      if (ESLINT_PROBLEM.test(line)) keep(line.replace(/(\S) {3,}/g, '$1  '))
    } else if (/^\s*❯ /.test(line) && !STACK_FRAME.test(line)) {
      keep(line) // the test's own location, past the cap
    } else if (line === '' || CODE_FRAME.test(line) || STACK_FRAME.test(line) || /^\s+Error Context: |^\s+attachment #/.test(line)) {
      // Noise inside a failure block.
    } else {
      keepInBlock(line)
    }
  }
  endBlock()

  if (!signal) return input.filter((line, i, all) => i < all.length - 1 || line !== '').slice(-FALLBACK_TAIL).join('\n')
  return out.join('\n')
}

// One gate command, optional `VAR=value` prefixes and plain arguments. Anything
// with shell operators, substitutions or odd quoting stays untouched (raw output).
const ENV_PREFIX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=[\w@%+=:,./-]*\s+)*`
const GATE = String.raw`(?:npm\s+run\s+(?:check|test|e2e)|npm\s+test|npx\s+vitest\s+run|npx\s+playwright\s+test)`
const ARG = String.raw`(?:[\w@%+=:,./\\-]+|"[^"$\x60\\]*"|'[^']*')`
const GATE_COMMAND = new RegExp(String.raw`^${ENV_PREFIX}${GATE}(?:[ \t]+${ARG})*$`)

/**
 * The rewritten command, or null when `command` is not a plain gate invocation.
 * `pipefail` keeps the gate's exit code; the filter itself always exits 0.
 *
 * @param {string} command raw `tool_input.command`
 * @param {string} filterScript absolute path of `scripts/filter-test-output.mjs`
 */
export function wrapGateCommand(command, filterScript) {
  const trimmed = command.trim()
  if (!GATE_COMMAND.test(trimmed)) return null
  const script = filterScript.replaceAll('\\', '/')
  if (/["$`\n]/.test(script)) return null
  return `(set -o pipefail; ${trimmed} 2>&1 | node "${script}")`
}

/**
 * PreToolUse(Bash) hook output, or null to leave the call alone. `allow` skips
 * only the prompt for a known gate command; deny/ask rules still apply to the
 * rewritten input (hooks docs, "PreToolUse decision control").
 *
 * @param {{ tool_input?: Record<string, unknown> } | null} input
 * @param {{ filterScript: string }} options
 */
export function buildHookOutput(input, { filterScript }) {
  const toolInput = input?.tool_input
  if (typeof toolInput?.command !== 'string') return null
  const command = wrapGateCommand(toolInput.command, filterScript)
  if (!command) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'Gate output piped through scripts/filter-test-output.mjs (failures + summary only).',
      updatedInput: { ...toolInput, command },
    },
  }
}
