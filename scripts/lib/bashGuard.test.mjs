import { describe, expect, it } from 'vitest'
import { classifyBashCommand, evaluateHookInput } from './bashGuard.mjs'

const SCRATCH = '/tmp/claude-0/-repo/1234/scratchpad'
const options = {
  allowedDirs: ['/tmp', '/var/tmp/agent', 'C:\\Users\\me\\AppData\\Local\\Temp'],
  env: { TMPDIR: '/var/tmp/agent', HOME: '/home/me' },
}
const classify = (command) => classifyBashCommand(command, options)

const heredoc = (head, body, tail = 'EOF') => `${head}\n${body}\n${tail}`

describe('classifyBashCommand — allowed', () => {
  it.each([
    'grep -rn foo src | head -20',
    'npm run check 2>&1 | tail -40',
    'ls > /dev/null 2>&1',
    'npm run build &> /dev/null',
    'curl -s https://example.com > /dev/stdout',
    'echo x > nul',
    `echo hi > ${SCRATCH}/out.txt`,
    'echo hi >> /tmp/run.log',
    'echo hi > "$TMPDIR/out.txt"',
    'echo hi > ${TMPDIR}/out.txt',
    'echo hi > C:\\Users\\me\\AppData\\Local\\Temp\\a.txt',
    'echo hi > /c/Users/me/AppData/Local/Temp/a.txt',
    'npx vitest run scripts/lib > /tmp/vitest.log 2>&1',
    'npm install',
    'npm ci && npm run check',
    'git status',
    'git log --oneline | head',
    'git log --grep reset',
    'git add -A && git commit -m "fix: keep a > b"',
    'git commit -m "wip: before reset"',
    heredoc("git commit -F - <<'EOF'", 'chore: msg\n\ngit reset and git stash > mentioned here'),
    'git commit -m "$(cat <<\'EOF\'\nchore: x > y\nEOF\n)"',
    'git checkout -b feat/x',
    'git checkout dev',
    'git switch dev',
    'git diff -- src/a.ts',
    'cat file | tee',
    'echo x | tee /dev/null',
    'echo x | tee -a /tmp/a.log',
    "sed -n '1,20p' file",
    "sed 's/a/b/' file",
    "sed -e 's/i/x/' file",
    "perl -ne 'print if /x/' file",
    'perl -MList::Util -e 1',
    'grep ">" file',
    "echo 'a > b'",
    'node -e "console.log(1 > 0)"',
    'echo "git stash"',
    heredoc('cat <<EOF > /tmp/note.md', '> quoted line\ngit reset --hard'),
    'ls # > notes.txt',
    'diff <(sort a) <(sort b)',
    'echo x | tee >(grep x)',
    'cmd 2>&1 >/dev/null',
    'tee < input.txt',
    'wc -l < src/a.ts',
    'git apply < /tmp/fix.patch',
    'grep -c x <<< "a > b"',
    'exec 3>&-',
  ])('%s', (command) => {
    expect(classify(command)).toEqual({ blocked: false })
  })
})

describe('classifyBashCommand — blocked file writes', () => {
  it.each([
    'echo x > src/a.ts',
    'echo x >> README.md',
    'echo x>f',
    'printf x >| f',
    'npm run build &> build.log',
    'npm run test 2> err.log',
    'echo x > /home/me/repo/a.ts',
    'echo x > ~/notes.txt',
    'echo x > "$OUT"',
    'echo x > /tmp/../home/me/a.ts',
    heredoc("cat <<'EOF' > src/x.ts", 'export const x = 1'),
    heredoc('cat > src/x.ts <<EOF', 'export const x = 1'),
    'echo x | tee src/a.ts',
    'tee -a log.txt < in',
    'echo x | tee /tmp/ok.txt src/bad.ts',
    "sed -i 's/a/b/' f",
    "sed -i.bak 's/a/b/' f",
    "sed --in-place 's/a/b/' f",
    "sed -ni 's/a/b/p' f",
    "sed -E -i 's/a/b/' f",
    "perl -pi -e 's/a/b/' f",
    "perl -i.bak -pe 's/a/b/' f",
    'ls; echo x > f',
    'npm run check && echo done > status.txt',
    '(cd src && echo x > a.ts)',
    'bash -c "echo x > f"',
    'sudo tee /etc/hosts',
    "FOO=1 sed -i 's/a/b/' f",
    "find . -name '*.ts' | xargs sed -i 's/a/b/'",
    "find . | xargs -I{} sed -i 's/a/b/' {}",
  ])('%s', (command) => {
    const result = classify(command)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/Edit\/Write/)
  })
})

describe('classifyBashCommand — blocked destructive git', () => {
  it.each([
    'git stash',
    'git stash list',
    'git stash pop',
    'git -C ../other stash push -m x',
    'git --no-pager stash show',
    'git reset',
    'git reset --hard HEAD',
    'git reset HEAD~1',
    'git reset --soft origin/dev',
    'git checkout -- src/a.ts',
    'git checkout HEAD -- src/a.ts',
    'git checkout .',
    'git restore src/a.ts',
    'git restore --staged src/a.ts',
    'npm run check && git stash',
    'echo $(git reset --hard)',
    'echo `git stash`',
    "sh -c 'git reset --hard'",
  ])('%s', (command) => {
    const result = classify(command)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/WIP commit/)
  })
})

describe('evaluateHookInput', () => {
  const hookOptions = { env: { TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' }, tmpdir: '/var/folders/x/T' }
  const input = (command, extra = {}) => ({ tool_name: 'Bash', tool_input: { command }, ...extra })

  it('leaves the main session alone (no agent_id)', () => {
    expect(evaluateHookInput(input('git reset --hard'), hookOptions)).toEqual({ blocked: false })
  })

  it('blocks a subagent with a reason naming the rule', () => {
    const result = evaluateHookInput(input('git stash', { agent_id: 'a1' }), hookOptions)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/^Blocked for subagents \(AGENTS\.md #15/)
  })

  it.each([
    'echo x > /tmp/claude-0/repo/1/scratchpad/a.txt',
    'echo x > /var/folders/x/T/a.txt',
    'echo x > /c/Users/me/AppData/Local/Temp/claude/a.txt',
  ])('lets a subagent write to temp dirs: %s', (command) => {
    expect(evaluateHookInput(input(command, { agent_id: 'a1' }), hookOptions)).toEqual({ blocked: false })
  })

  it('ignores input without a command', () => {
    expect(evaluateHookInput({ agent_id: 'a1', tool_input: {} }, hookOptions)).toEqual({ blocked: false })
    expect(evaluateHookInput(null, hookOptions)).toEqual({ blocked: false })
  })
})
