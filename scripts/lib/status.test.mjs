import { describe, expect, it } from 'vitest'
import { formatStatus, parseAheadBehind, parsePorcelain, summarizeChecks } from './status.mjs'

describe('parseAheadBehind', () => {
  it('reads `git rev-list --left-right --count base...HEAD` (behind first)', () => {
    expect(parseAheadBehind('3\t5\n')).toEqual({ behind: 3, ahead: 5 })
  })

  it('returns null for unexpected output', () => {
    expect(parseAheadBehind('')).toBeNull()
    expect(parseAheadBehind('fatal: bad revision')).toBeNull()
  })
})

describe('parsePorcelain', () => {
  it('keeps one entry per changed path', () => {
    expect(parsePorcelain(' M src/a.ts\n?? new.txt\n')).toEqual([' M src/a.ts', '?? new.txt'])
  })

  it('is empty for a clean tree', () => {
    expect(parsePorcelain('')).toEqual([])
  })
})

describe('summarizeChecks', () => {
  it('is "none" without checks', () => {
    expect(summarizeChecks([])).toEqual({ state: 'none', total: 0, failing: [], pending: [] })
    expect(summarizeChecks(undefined).state).toBe('none')
  })

  it('is "pass" when every check run succeeded or was skipped/neutral', () => {
    const rollup = [
      { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'e2e', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { __typename: 'StatusContext', context: 'railway', state: 'SUCCESS' },
    ]
    expect(summarizeChecks(rollup)).toEqual({ state: 'pass', total: 3, failing: [], pending: [] })
  })

  it('is "pending" while a check is running and nothing failed', () => {
    const rollup = [
      { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
      { __typename: 'StatusContext', context: 'railway', state: 'PENDING' },
    ]
    expect(summarizeChecks(rollup)).toMatchObject({ state: 'pending', pending: ['e2e', 'railway'] })
  })

  it('is "fail" when any check failed, naming it', () => {
    const rollup = [
      { __typename: 'CheckRun', name: 'quality', status: 'COMPLETED', conclusion: 'FAILURE' },
      { __typename: 'CheckRun', name: 'e2e', status: 'QUEUED', conclusion: null },
      { __typename: 'StatusContext', context: 'railway', state: 'ERROR' },
    ]
    expect(summarizeChecks(rollup)).toMatchObject({ state: 'fail', failing: ['quality', 'railway'], pending: ['e2e'] })
  })
})

describe('formatStatus', () => {
  const base = {
    branch: 'claude/x',
    head: 'abc1234 feat: thing',
    base: 'origin/dev',
    aheadBehind: { ahead: 2, behind: 0 },
    dirty: [],
  }

  it('prints branch, head, ahead/behind, clean tree and the PR with CI state', () => {
    const out = formatStatus({
      ...base,
      pr: { number: 42, state: 'OPEN', checks: { state: 'pass', total: 3, failing: [], pending: [] } },
    })
    expect(out).toBe(
      [
        'branch: claude/x',
        'HEAD:   abc1234 feat: thing',
        'vs origin/dev: ahead 2, behind 0',
        'dirty:  none',
        'PR:     #42 OPEN, CI pass (3 checks)',
      ].join('\n'),
    )
  })

  it('lists dirty files and failing checks', () => {
    const out = formatStatus({
      ...base,
      dirty: [' M a.ts', '?? b.ts'],
      pr: { number: 7, state: 'OPEN', checks: { state: 'fail', total: 2, failing: ['quality'], pending: ['e2e'] } },
    })
    expect(out).toContain('dirty:  2 files\n   M a.ts\n  ?? b.ts')
    expect(out).toContain('PR:     #7 OPEN, CI fail (2 checks) — failing: quality; pending: e2e')
  })

  it('degrades without a base ref, without a PR and without gh', () => {
    expect(formatStatus({ ...base, aheadBehind: null, pr: { none: true } })).toContain(
      'vs origin/dev: unknown (ref missing — git fetch origin dev)',
    )
    expect(formatStatus({ ...base, pr: { none: true } })).toContain('PR:     none for this branch')
    expect(formatStatus({ ...base, pr: { error: 'gh not installed' } })).toContain('PR:     unavailable (gh not installed)')
  })
})
