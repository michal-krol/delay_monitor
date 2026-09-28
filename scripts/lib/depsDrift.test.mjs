import { describe, expect, it } from 'vitest'
import { findDrift } from './depsDrift.mjs'

const pkg = { dependencies: { next: '^16.3.0' }, devDependencies: { vitest: '^4.0.0' } }
const lock = {
  packages: {
    'node_modules/next': { version: '16.3.1' },
    'node_modules/vitest': { version: '4.1.0' },
  },
}

describe('findDrift', () => {
  it('returns nothing when installed versions match the lockfile', () => {
    const installed = { next: '16.3.1', vitest: '4.1.0' }
    expect(findDrift(pkg, lock, (name) => installed[name])).toEqual([])
  })

  it('reports a direct dependency whose installed version differs from the lockfile', () => {
    const installed = { next: '16.2.0', vitest: '4.1.0' }
    expect(findDrift(pkg, lock, (name) => installed[name])).toEqual([
      { name: 'next', locked: '16.3.1', installed: '16.2.0' },
    ])
  })

  it('reports a locked package that is not installed at all as installed: null', () => {
    const installed = { next: '16.3.1' }
    expect(findDrift(pkg, lock, (name) => installed[name] ?? null)).toEqual([
      { name: 'vitest', locked: '4.1.0', installed: null },
    ])
  })
})
