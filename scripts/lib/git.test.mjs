import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from './git.mjs'

afterEach(() => vi.unstubAllEnvs())

// Windows run() uses cmd.exe; POSIX receives the JS directly through shell:false.
const programArg = code => process.platform === 'win32' ? `"${code}"` : code

describe('quality command environment', () => {
  it('does not pass repository-local Git hook variables to nested commands', () => {
    // A pre-push hook supplies these. A nested test may run git init in a temporary
    // directory; inheriting GIT_DIR would instead reinitialize the real repository.
    vi.stubEnv('GIT_DIR', 'Z:/nonexistent-ui-test')
    vi.stubEnv('GIT_WORK_TREE', 'Z:/nonexistent-ui-worktree')
    vi.stubEnv('GIT_INDEX_FILE', 'Z:/nonexistent-ui-index')
    expect(run('node', ['-e', programArg('process.exit(process.env.GIT_DIR||process.env.GIT_WORK_TREE||process.env.GIT_INDEX_FILE?23:0)')])).toBe(0)
  })

  it('preserves ordinary command configuration and PATH', () => {
    vi.stubEnv('UI_GATE_SENTINEL', 'kept')
    expect(run('node', ['-e', programArg("process.exit(process.env.UI_GATE_SENTINEL==='kept'&&process.env.PATH?0:23)")])).toBe(0)
  })

  it('executes the probe and preserves a nonzero exit code on every platform', () => {
    expect(run('node', ['-e', programArg('process.exit(23)')])).toBe(23)
  })
})
