import { describe, expect, it } from 'vitest'
import {
  ACTIVE_MINUTES,
  classifyWorktree,
  formatNudge,
  formatReport,
  isManagedWorktree,
  parseWorktreeList,
  pickPr,
  planHandoffCopies,
  staleEntries,
  summarize,
} from './worktreeCleanup.mjs'

/** A clean, idle, pushed worktree whose PR merged — the base case; each test bends one fact. */
const base = {
  isCurrent: false,
  isMain: false,
  skipped: false,
  idleMinutes: 5000,
  dirty: 0,
  headInBase: false,
  uniqueCommits: 3,
  pushed: true,
  pr: { state: 'MERGED', headMatches: true },
}
const verdict = (facts) => classifyWorktree({ ...base, ...facts }).verdict

describe('classifyWorktree', () => {
  it('SAFE: merged PR, clean, pushed, idle', () => {
    expect(classifyWorktree(base)).toEqual({ verdict: 'SAFE', reasons: ['PR merged, HEAD pushed'] })
  })

  it('KEEP: the current worktree and the main checkout, whatever the PR says', () => {
    expect(verdict({ isCurrent: true })).toBe('KEEP')
    expect(verdict({ isMain: true })).toBe('KEEP')
  })

  it('KEEP: a worktree named with --skip (running session)', () => {
    expect(verdict({ skipped: true })).toBe('KEEP')
  })

  it('KEEP: git admin files touched within the activity window', () => {
    expect(verdict({ idleMinutes: ACTIVE_MINUTES - 1 })).toBe('KEEP')
    expect(verdict({ idleMinutes: ACTIVE_MINUTES })).toBe('SAFE')
  })

  it('the activity window is configurable (0 = nothing counts as running)', () => {
    const facts = { ...base, idleMinutes: 1 }
    expect(classifyWorktree(facts).verdict).toBe('KEEP')
    expect(classifyWorktree(facts, { activeMinutes: 0 }).verdict).toBe('SAFE')
  })

  it('unknown idle time does not block (null)', () => {
    expect(verdict({ idleMinutes: null })).toBe('SAFE')
  })

  it('KEEP: dirty tree', () => {
    expect(verdict({ dirty: 1 })).toBe('KEEP')
  })

  it('KEEP: open PR', () => {
    expect(verdict({ pr: { state: 'OPEN', headMatches: true } })).toBe('KEEP')
  })

  it('KEEP: merged PR but local HEAD is neither pushed, in base nor the PR head', () => {
    const r = classifyWorktree({ ...base, pushed: false, pr: { state: 'MERGED', headMatches: false } })
    expect(r.verdict).toBe('KEEP')
    expect(r.reasons[0]).toMatch(/unpushed/)
  })

  it('SAFE: merged PR, remote branch gone but local HEAD equals the PR head', () => {
    expect(verdict({ pushed: false, pr: { state: 'MERGED', headMatches: true } })).toBe('SAFE')
  })

  it('SAFE: closed PR with a pushed head', () => {
    expect(verdict({ pr: { state: 'CLOSED', headMatches: true } })).toBe('SAFE')
  })

  it('SAFE: no PR but HEAD already in origin/dev', () => {
    expect(verdict({ pr: null, pushed: false, headInBase: true })).toBe('SAFE')
  })

  it('KEEP: no PR and unique commits', () => {
    expect(verdict({ pr: null, pushed: false, uniqueCommits: 1 })).toBe('KEEP')
  })

  it('UNSURE: no PR, not in base, unique-commit count unknown', () => {
    expect(verdict({ pr: null, pushed: false, uniqueCommits: null })).toBe('UNSURE')
  })

  it('UNSURE: gh unavailable and HEAD not in base; SAFE if HEAD is in base', () => {
    expect(verdict({ pr: 'unavailable' })).toBe('UNSURE')
    expect(verdict({ pr: 'unavailable', headInBase: true })).toBe('SAFE')
  })

  it('dirty beats a merged PR (safety order)', () => {
    expect(verdict({ dirty: 2, headInBase: true })).toBe('KEEP')
  })
})

describe('parseWorktreeList', () => {
  const text = [
    'worktree E:/repo',
    'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'branch refs/heads/dev',
    '',
    'worktree E:/repo/.claude/worktrees/one',
    'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'branch refs/heads/feat/x',
    'locked claude agent',
    '',
    'worktree E:/repo/.claude/worktrees/two',
    'HEAD cccccccccccccccccccccccccccccccccccccccc',
    'detached',
    '',
  ].join('\n')

  it('reads path, head, branch, detached and locked per block', () => {
    expect(parseWorktreeList(text)).toEqual([
      { path: 'E:/repo', head: 'a'.repeat(40), branch: 'dev', detached: false, locked: false },
      { path: 'E:/repo/.claude/worktrees/one', head: 'b'.repeat(40), branch: 'feat/x', detached: false, locked: true },
      { path: 'E:/repo/.claude/worktrees/two', head: 'c'.repeat(40), branch: null, detached: true, locked: false },
    ])
  })

  it('is empty for empty output', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})

describe('isManagedWorktree', () => {
  const root = 'E:/repo'
  it('accepts exactly one level under .claude/worktrees', () => {
    expect(isManagedWorktree(root, 'E:/repo/.claude/worktrees/one')).toBe(true)
    expect(isManagedWorktree(root, 'E:\\repo\\.claude\\worktrees\\one\\')).toBe(true)
  })

  it('rejects the main checkout, the container, nested, parent-escaping and foreign paths', () => {
    expect(isManagedWorktree(root, 'E:/repo')).toBe(false)
    expect(isManagedWorktree(root, 'E:/repo/.claude/worktrees')).toBe(false)
    expect(isManagedWorktree(root, 'E:/repo/.claude/worktrees/one/sub')).toBe(false)
    expect(isManagedWorktree(root, 'E:/repo/.claude/worktrees/../src')).toBe(false)
    expect(isManagedWorktree(root, 'E:/other/.claude/worktrees/one')).toBe(false)
  })
})

describe('pickPr', () => {
  const pr = (number, state, headRefName, headRefOid) => ({ number, state, headRefName, headRefOid })
  it('is null when no PR has that head branch', () => {
    expect(pickPr([pr(1, 'MERGED', 'other', 'x')], 'feat/a', 'x')).toBeNull()
  })

  it('open beats merged', () => {
    expect(pickPr([pr(1, 'MERGED', 'feat/a', 'h1'), pr(2, 'OPEN', 'feat/a', 'h1')], 'feat/a', 'h1')).toEqual({
      number: 2,
      state: 'OPEN',
      headMatches: true,
    })
  })

  it('prefers the PR whose head equals the local HEAD, then merged over closed', () => {
    const list = [pr(1, 'CLOSED', 'feat/a', 'h1'), pr(2, 'MERGED', 'feat/a', 'h2'), pr(3, 'MERGED', 'feat/a', 'h1')]
    expect(pickPr(list, 'feat/a', 'h1')).toEqual({ number: 3, state: 'MERGED', headMatches: true })
    expect(pickPr(list, 'feat/a', 'h9')).toEqual({ number: 2, state: 'MERGED', headMatches: false })
  })
})

describe('planHandoffCopies', () => {
  it('copies a handoff the main checkout lacks, under its own name', () => {
    expect(planHandoffCopies([{ name: 'a.md', hash: '1' }], [], 'wt')).toEqual([{ from: 'a.md', to: 'a.md' }])
  })

  it('skips a file whose content already exists in main (any name)', () => {
    expect(planHandoffCopies([{ name: 'a.md', hash: '1' }], [{ name: 'renamed.md', hash: '1' }], 'wt')).toEqual([])
  })

  it('suffixes with the worktree name when the name collides with different content', () => {
    expect(planHandoffCopies([{ name: 'a.md', hash: '2' }], [{ name: 'a.md', hash: '1' }], 'wt')).toEqual([
      { from: 'a.md', to: 'a-wt.md' },
    ])
  })

  it('counts up when the suffixed name is taken too', () => {
    const main = [
      { name: 'a.md', hash: '1' },
      { name: 'a-wt.md', hash: '3' },
    ]
    expect(planHandoffCopies([{ name: 'a.md', hash: '2' }], main, 'wt')).toEqual([{ from: 'a.md', to: 'a-wt-2.md' }])
  })

  it('does not copy two worktree files with equal content twice', () => {
    const files = [
      { name: 'a.md', hash: '1' },
      { name: 'b.md', hash: '1' },
    ]
    expect(planHandoffCopies(files, [], 'wt')).toEqual([{ from: 'a.md', to: 'a.md' }])
  })
})

describe('staleEntries', () => {
  it('returns names strictly older than the limit', () => {
    const entries = [
      { name: 'old', mtimeMs: 0 },
      { name: 'edge', mtimeMs: 100 },
      { name: 'new', mtimeMs: 150 },
    ]
    expect(staleEntries(entries, 200, 100)).toEqual(['old'])
  })
})

describe('summarize / formatNudge / formatReport', () => {
  const rows = [
    { name: 'a', branch: 'x', verdict: 'SAFE', reasons: ['PR merged, HEAD pushed'] },
    { name: 'b', branch: 'y', verdict: 'KEEP', reasons: ['dirty tree'] },
    { name: 'c', branch: null, verdict: 'UNSURE', reasons: ['gh unavailable'] },
    { name: 'd', branch: 'z', verdict: 'SAFE', reasons: ['PR merged, HEAD pushed'] },
  ]

  it('counts verdicts', () => {
    expect(summarize(rows, 123)).toEqual({ at: 123, safe: 2, keep: 1, unsure: 1 })
  })

  it('nudge only when something is SAFE', () => {
    expect(formatNudge({ at: 0, safe: 0, keep: 3, unsure: 0 })).toBeNull()
    expect(formatNudge({ at: 0, safe: 2, keep: 0, unsure: 0 })).toMatch(/2 .*npm run clean:worktrees/)
  })

  it('report lists every worktree with verdict and reason, SAFE first', () => {
    const text = formatReport(rows)
    expect(text.indexOf('SAFE')).toBeLessThan(text.indexOf('KEEP'))
    expect(text).toContain('b')
    expect(text).toContain('dirty tree')
    expect(text).toMatch(/SAFE: 2, KEEP: 1, UNSURE: 1/)
  })
})
