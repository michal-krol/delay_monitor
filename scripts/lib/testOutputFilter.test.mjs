import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyBashCommand, evaluateHookInput } from './bashGuard.mjs'
import { buildHookOutput, filterTestOutput, wrapGateCommand } from './testOutputFilter.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// Real outputs captured 2026-10-03 from `npm run check`, `npx vitest run` and
// `npx playwright test` (piped, as the Bash tool runs them) — see testing.md.
const fixture = (name) => readFileSync(path.join(dirname, 'fixtures/test-output', `${name}.txt`), 'utf8')
const lines = (text) => (text === '' ? [] : text.split('\n'))
const FILTER_SCRIPT = '/repo/scripts/filter-test-output.mjs'

describe('filterTestOutput — npm run check', () => {
  it('green run keeps only the step headers and the vitest summary', () => {
    expect(filterTestOutput(fixture('check-green'))).toBe(
      [
        '> delay_monitor@1.1.0 check',
        '> delay_monitor@1.1.0 typecheck',
        '> delay_monitor@1.1.0 lint',
        '> delay_monitor@1.1.0 test',
        ' Test Files  171 passed | 2 skipped (173)',
        '      Tests  2085 passed | 14 skipped (2099)',
      ].join('\n'),
    )
  })

  it('tsc errors keep every error line and its continuation', () => {
    const out = filterTestOutput(fixture('check-tsc'))
    expect(out).toBe(
      [
        '> delay_monitor@1.1.0 check',
        '> delay_monitor@1.1.0 typecheck',
        "src/zzprobe/bad.ts(4,9): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/zzprobe/bad.ts(5,16): error TS2339: Property 'title' does not exist on type 'Train'.",
        "src/zzprobe/bad.ts(8,27): error TS2345: Argument of type '{ id: number; }' is not assignable to parameter of type 'Train'.",
        "  Property 'name' is missing in type '{ id: number; }' but required in type 'Train'.",
        "src/zzprobe/broken-import.test.ts(1,25): error TS2307: Cannot find module './does-not-exist' or its corresponding type declarations.",
      ].join('\n'),
    )
  })

  it('eslint keeps file headers, one line per problem (padding collapsed) and the totals', () => {
    const out = filterTestOutput(fixture('check-eslint'))
    expect(out).toContain('/home/user/delay_monitor/src/zzprobe/bad.ts\n  1:30  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any')
    expect(out).toContain('/home/user/delay_monitor/src/zzprobe/bad2.tsx\n')
    expect(out).toContain('  6:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders')
    expect(out).toContain('  8:10  warning  img elements must have an alt prop')
    expect(out).toContain('✖ 9 problems (4 errors, 5 warnings)')
    expect(out).toContain('2 errors and 0 warnings potentially fixable')
    expect(lines(out).filter((line) => /^\s+\d+:\d+\s+(error|warning)\s/.test(line))).toHaveLength(9)
    expect(out).not.toMatch(/ {3,}\S/)
    expect(out).not.toContain('Effects are intended')
    expect(out).not.toContain('setNow(Date.now())')
  })

  it('failing unit tests keep names, assertions, diffs and summary — not logs, DOM dumps or code frames', () => {
    const raw = fixture('check-test-fail')
    const out = filterTestOutput(raw)
    expect(out).toContain(' FAIL  src/zzprobe/probe.test.ts > probe suite > compares numbers\nAssertionError: expected 2 to be 3 // Object.is equality')
    expect(out).toContain('- 3\n+ 2')
    expect(out).toContain(' FAIL  src/zzprobe/probe.test.ts > probe suite > compares objects')
    expect(out).toContain('-     3,\n+     2,')
    expect(out).toContain(' FAIL  src/zzprobe/dom.test.tsx > dom probe > finds missing button')
    expect(out).toContain('TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Odśwież"')
    expect(out).toContain(' ❯ src/zzprobe/dom.test.tsx:21:19')
    expect(out).toMatch(/… \d+ more lines/)
    expect(out).toContain(' Test Files  2 failed | 171 passed | 2 skipped (175)')
    expect(out).toContain('      Tests  3 failed | 2086 passed | 14 skipped (2103)')

    expect(out).not.toContain('noisy log line from test')
    expect(out).not.toContain('<span>')
    expect(out).not.toContain('node_modules')
    expect(out).not.toMatch(/^\s+\d+\|/m)
    expect(out).not.toMatch(/×/)
    expect(out).not.toMatch(/Isolate|Duration|Start at|RUN {2}v/)
    expect(out).not.toMatch(/\[\d+\/\d+\]/)
    expect(out).not.toContain('\x1b[')
    expect(lines(out).length).toBeLessThan(lines(raw).length / 4)
  })
})

describe('filterTestOutput — npx vitest run', () => {
  it('a suite that fails to import keeps its header and error', () => {
    const out = filterTestOutput(fixture('vitest-failed-suite'))
    expect(out).toContain('Failed Suites 1')
    expect(out).toContain(' FAIL  src/zzprobe/broken-import.test.ts [ src/zzprobe/broken-import.test.ts ]')
    expect(out).toContain("Error: Cannot find module './does-not-exist'")
    expect(out).toContain('Failed Tests 3')
    expect(out).toContain(' Test Files  3 failed (3)')
    expect(out).toContain('      Tests  3 failed | 1 passed (4)')
  })
})

describe('filterTestOutput — npm run e2e (Playwright list reporter)', () => {
  const out = filterTestOutput(fixture('e2e-fail'))

  it('keeps each failure header (rule chars trimmed) with its assertion lines', () => {
    expect(out).toContain('  1) [desktop-chromium] › zzpw/probe.spec.ts:11:5 › shows delay badge\n')
    expect(out).toContain('    Error: expect(locator).toBeVisible() failed')
    expect(out).toContain("    Locator: getByText('Opóźnienie')")
    expect(out).toContain('    Expected: "4"\n    Received: "3"')
    expect(out).not.toContain('───')
  })

  it('keeps the summary with the failed list', () => {
    expect(out).toContain(
      [
        '  4 failed',
        '    [desktop-chromium] › zzpw/probe.spec.ts:11:5 › shows delay badge',
        '    [desktop-chromium] › zzpw/probe.spec.ts:14:5 › counts trains',
        '    [mobile-chromium] › zzpw/probe.spec.ts:11:5 › shows delay badge',
        '    [mobile-chromium] › zzpw/probe.spec.ts:14:5 › counts trains',
        '  2 skipped',
        '  4 passed (10.8s)',
      ].join('\n'),
    )
  })

  it('drops progress lines, retries, code frames and attachments', () => {
    expect(out).not.toMatch(/✓|✘|Running \d+ tests/)
    expect(out).not.toContain('Retry #1')
    expect(out.match(/Error: expect\(locator\)\.toHaveText/g)).toHaveLength(2)
    expect(out).not.toMatch(/^\s+>?\s*\d+ \|/m)
    expect(out).not.toMatch(/Error Context|^\s+at /m)
  })
})

describe('filterTestOutput — robustness', () => {
  it('treats CRLF (Windows) the same as LF', () => {
    const raw = fixture('check-test-fail')
    expect(filterTestOutput(raw.replaceAll('\n', '\r\n'))).toBe(filterTestOutput(raw))
  })

  it('falls back to the raw tail when nothing recognizable is found', () => {
    const raw = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    expect(filterTestOutput(raw)).toBe(Array.from({ length: 60 }, (_, i) => `line ${i + 40}`).join('\n'))
    expect(filterTestOutput('')).toBe('')
  })

  it('caps a long failure block', () => {
    const raw = [' FAIL  a.test.ts > x', ...Array.from({ length: 50 }, (_, i) => `detail ${i}`), ' Test Files  1 failed (1)'].join('\n')
    const out = lines(filterTestOutput(raw, { maxBlockLines: 5 }))
    expect(out).toEqual([' FAIL  a.test.ts > x', 'detail 0', 'detail 1', 'detail 2', 'detail 3', '… 46 more lines', ' Test Files  1 failed (1)'])
  })
})

describe('wrapGateCommand', () => {
  it.each([
    'npm run check',
    'npm run test',
    'npm test',
    'TZ=UTC npm run test',
    'PKP_CONTRACT=1 npm run test -- contract',
    'npx vitest run',
    'npx vitest run scripts/lib src/lib/board/poller.test.ts',
    'npx vitest run src/lib -t "realization keeps planned"',
    'npm run e2e',
    'E2E_PORT=3200 npm run e2e -- --project=desktop-chromium e2e/board.spec.ts',
    'npx playwright test e2e/map.spec.ts',
    '  npm run check  ',
  ])('wraps %s', (command) => {
    expect(wrapGateCommand(command, FILTER_SCRIPT)).toBe(
      `(set -o pipefail; ${command.trim()} 2>&1 | node "${FILTER_SCRIPT}")`,
    )
  })

  it.each([
    'npm run check 2>&1 | tail -40',
    'npm run check > /tmp/check.log',
    'npm run check && git push -u origin feat',
    'npm run check; echo done',
    'npm run check &',
    'npm run test $(cat args)',
    'npm run test `cat args`',
    'npm run test -- "$PATTERN"',
    "npx vitest run -t 'it''s'",
    'npm run check\nnpm run lint',
    'npm run lint',
    'npm run typecheck',
    'npm run test:coverage',
    'npm run checkout',
    'npx vitest',
    'npx vitest watch',
    'echo npm run check',
    'git commit -m "npm run check"',
  ])('leaves %j untouched', (command) => {
    expect(wrapGateCommand(command, FILTER_SCRIPT)).toBeNull()
  })

  it('uses forward slashes for a Windows script path and refuses an unsafe one', () => {
    expect(wrapGateCommand('npm run check', 'E:\\Claude_Code\\delay_monitor\\scripts\\filter-test-output.mjs')).toBe(
      '(set -o pipefail; npm run check 2>&1 | node "E:/Claude_Code/delay_monitor/scripts/filter-test-output.mjs")',
    )
    expect(wrapGateCommand('npm run check', '/a/$HOME/f.mjs')).toBeNull()
    expect(wrapGateCommand('npm run check', '/a/"b/f.mjs')).toBeNull()
  })

  it('the wrapped command passes the subagent write guard (block-bash-writes.mjs)', () => {
    const command = wrapGateCommand('TZ=UTC npm run test -- src/lib', FILTER_SCRIPT)
    expect(classifyBashCommand(command)).toEqual({ blocked: false })
    expect(evaluateHookInput({ agent_id: 'a1', tool_input: { command } })).toEqual({ blocked: false })
  })
})

describe('buildHookOutput', () => {
  it('rewrites the command, keeps the other Bash fields and allows the call', () => {
    const input = { tool_name: 'Bash', tool_input: { command: 'npm run check', description: 'Run gate', timeout: 600000 } }
    expect(buildHookOutput(input, { filterScript: FILTER_SCRIPT })).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: expect.stringContaining('filter-test-output'),
        updatedInput: {
          command: `(set -o pipefail; npm run check 2>&1 | node "${FILTER_SCRIPT}")`,
          description: 'Run gate',
          timeout: 600000,
        },
      },
    })
  })

  it.each([
    [{ tool_input: { command: 'git status' } }],
    [{ tool_input: {} }],
    [{}],
    [null],
  ])('returns null for %j', (input) => {
    expect(buildHookOutput(input, { filterScript: FILTER_SCRIPT })).toBeNull()
  })
})

describe('scripts/filter-test-output.mjs through bash (exit code preserved)', () => {
  const script = path.resolve(dirname, '../filter-test-output.mjs')
  const run = (inner) => spawnSync('bash', ['-c', wrapGateCommand('npm run check', script).replace('npm run check', inner)], { encoding: 'utf8' })

  it('keeps a failing exit code and prints only the filtered output plus the raw log path', () => {
    const result = run(`node -e "console.log('noise'); console.log(' FAIL  a.test.ts > x'); console.log(' Test Files  1 failed (1)'); process.exit(3)"`)
    expect(result.status).toBe(3)
    expect(result.stdout).toMatch(/^\[filtered test output; full log: .+\.log\]\n FAIL {2}a\.test\.ts > x\n Test Files {2}1 failed \(1\)\n$/)
    const logPath = result.stdout.match(/full log: (.+\.log)\]/)[1]
    expect(readFileSync(logPath, 'utf8')).toContain('noise')
  })

  it('exits 0 on a green run', () => {
    expect(run(`node -e "console.log(' Test Files  1 passed (1)')"`).status).toBe(0)
  })
})
