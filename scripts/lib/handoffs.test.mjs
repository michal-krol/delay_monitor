import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncHandoffs } from './handoffs.mjs'

let root
let wt
let main

const put = (dir, name, text) => {
  mkdirSync(path.join(dir, 'docs'), { recursive: true })
  writeFileSync(path.join(dir, 'docs', name), text)
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'handoffs-'))
  main = path.join(root, 'main')
  wt = path.join(root, 'main', '.claude', 'worktrees', 'brave-test-123')
  mkdirSync(main, { recursive: true })
  mkdirSync(wt, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('syncHandoffs', () => {
  it('copies a handoff main lacks, creating main/docs', () => {
    put(wt, 'session-handoff1.md', 'one')
    const r = syncHandoffs({ wtPath: wt, mainRoot: main, name: 'brave-test-123' })
    expect(r).toEqual({ copied: [{ from: 'session-handoff1.md', to: 'session-handoff1.md' }], error: null })
    expect(readFileSync(path.join(main, 'docs', 'session-handoff1.md'), 'utf8')).toBe('one')
  })

  it('is idempotent: a second run copies nothing', () => {
    put(wt, 'a.md', 'one')
    syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' })
    expect(syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' }).copied).toEqual([])
  })

  it('keeps main\'s file and suffixes the copy when the name clashes with different content', () => {
    put(main, 'a.md', 'main version')
    put(wt, 'a.md', 'worktree version')
    const r = syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' })
    expect(r.copied).toEqual([{ from: 'a.md', to: 'a-w.md' }])
    expect(readFileSync(path.join(main, 'docs', 'a.md'), 'utf8')).toBe('main version')
    expect(readFileSync(path.join(main, 'docs', 'a-w.md'), 'utf8')).toBe('worktree version')
  })

  it('does nothing without a docs directory and never deletes from the worktree', () => {
    expect(syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' })).toEqual({ copied: [], error: null })
    put(wt, 'a.md', 'x')
    syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' })
    expect(readdirSync(path.join(wt, 'docs'))).toEqual(['a.md'])
  })

  it('only top-level markdown is a handoff (other files are left alone)', () => {
    put(wt, 'a.md', 'x')
    put(wt, 'shot.png', 'binary')
    expect(syncHandoffs({ wtPath: wt, mainRoot: main, name: 'w' }).copied.map((c) => c.to)).toEqual(['a.md'])
  })
})
