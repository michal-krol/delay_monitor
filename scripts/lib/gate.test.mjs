import { describe, expect, it } from 'vitest'
import {
  diffBases,
  isStampName,
  parsePrePushInput,
  planPrePush,
  stampName,
  staleStamps,
  touchesAppDir,
} from './gate.mjs'

const TREE = 'a'.repeat(40)
const SHA_A = '1'.repeat(40)
const SHA_B = '2'.repeat(40)
const ZERO = '0'.repeat(40)

describe('stampName', () => {
  it('names the stamp after the tree hash', () => {
    expect(stampName(TREE)).toBe(`gate-ok-${TREE}`)
  })

  it('accepts a SHA-256 tree hash', () => {
    expect(stampName('b'.repeat(64))).toBe(`gate-ok-${'b'.repeat(64)}`)
  })

  it('refuses anything that is not a full hex hash (no path tricks, no empty tree)', () => {
    for (const bad of ['', 'abc', '../x', `${TREE}\n`, 'g'.repeat(40)]) {
      expect(() => stampName(bad)).toThrow()
    }
  })
})

describe('isStampName', () => {
  it('recognizes only stamp files', () => {
    expect(isStampName(`gate-ok-${TREE}`)).toBe(true)
    expect(isStampName('HEAD')).toBe(false)
    expect(isStampName('gate-ok-xyz')).toBe(false)
  })
})

describe('staleStamps', () => {
  const day = 24 * 60 * 60 * 1000
  it('returns stamp files older than maxAge and ignores other files', () => {
    const now = 100 * day
    const entries = [
      { name: `gate-ok-${'c'.repeat(40)}`, mtimeMs: now - 20 * day },
      { name: `gate-ok-${'d'.repeat(40)}`, mtimeMs: now - 1 * day },
      { name: 'ORIG_HEAD', mtimeMs: 0 },
    ]
    expect(staleStamps(entries, now, 14 * day)).toEqual([`gate-ok-${'c'.repeat(40)}`])
  })
})

describe('parsePrePushInput', () => {
  it('parses one line per pushed ref', () => {
    const text = `refs/heads/feat ${SHA_A} refs/heads/feat ${SHA_B}\nrefs/heads/x ${SHA_B} refs/heads/x ${ZERO}\n`
    expect(parsePrePushInput(text)).toEqual([
      { localRef: 'refs/heads/feat', localSha: SHA_A, remoteRef: 'refs/heads/feat', remoteSha: SHA_B },
      { localRef: 'refs/heads/x', localSha: SHA_B, remoteRef: 'refs/heads/x', remoteSha: null },
    ])
  })

  it('drops branch deletions (local sha all zeros) and blank lines', () => {
    expect(parsePrePushInput(`(delete) ${ZERO} refs/heads/old ${SHA_A}\n\n`)).toEqual([])
  })

  it('ignores malformed lines instead of trusting them', () => {
    expect(parsePrePushInput('garbage\nrefs/heads/a nothex refs/heads/a nothex\n')).toEqual([])
  })
})

describe('diffBases', () => {
  it('tries the remote sha first, then the merge base, for an existing branch', () => {
    expect(diffBases({ remoteSha: SHA_B }, SHA_A)).toEqual([SHA_B, SHA_A])
  })

  it('uses only the merge base for a new branch', () => {
    expect(diffBases({ remoteSha: null }, SHA_A)).toEqual([SHA_A])
  })

  it('is empty when neither is known (caller treats the range as unknown)', () => {
    expect(diffBases({ remoteSha: null }, null)).toEqual([])
  })
})

describe('touchesAppDir', () => {
  it('is true for any path under src/app/', () => {
    expect(touchesAppDir(['README.md', 'src/app/api/board/route.ts'])).toBe(true)
  })

  it('is false for lookalikes and other dirs', () => {
    expect(touchesAppDir(['src/application.ts', 'src/lib/app/x.ts', 'app/src/app/x'])).toBe(false)
  })
})

describe('planPrePush', () => {
  it('skips the gate when every pushed tree has a stamp', () => {
    const plan = planPrePush([{ stamped: true, changedFiles: ['README.md'] }])
    expect(plan).toEqual({ runCheck: false, runBuild: false })
  })

  it('runs the gate when any pushed tree lacks a stamp', () => {
    const plan = planPrePush([
      { stamped: true, changedFiles: [] },
      { stamped: false, changedFiles: [] },
    ])
    expect(plan.runCheck).toBe(true)
  })

  it('runs the build when the pushed range touches src/app/, even with a stamp', () => {
    const plan = planPrePush([{ stamped: true, changedFiles: ['src/app/(app)/page.tsx'] }])
    expect(plan).toEqual({ runCheck: false, runBuild: true })
  })

  it('runs the build when the changed files are unknown', () => {
    expect(planPrePush([{ stamped: true, changedFiles: null }]).runBuild).toBe(true)
  })

  it('does nothing for a push with no ref updates (only deletions)', () => {
    expect(planPrePush([])).toEqual({ runCheck: false, runBuild: false })
  })
})
