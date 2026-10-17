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
    'git apply --check < /tmp/fix.patch',
    'grep -c x <<< "a > b"',
    'exec 3>&-',
    // interpreters: reading, repo scripts and npm scripts stay allowed
    'npm run vendor:maplibre',
    'node scripts/check.mjs',
    'node scripts/enrich-station-coords.mjs --force',
    'node --version',
    'node -p "require(\'@playwright/test/package.json\').version"',
    'node -e "console.log(require(\'fs\').readFileSync(\'a.txt\', \'utf8\'))"',
    'node -e "require(\'fs\').writeFileSync(\'/tmp/x.json\', \'{}\')"',
    'node -e "require(\'fs\').writeFileSync(require(\'os\').tmpdir() + \'/x\', \'\')"',
    'node -e "fs.writeFileSync(\'C:\\\\Users\\\\me\\\\AppData\\\\Local\\\\Temp\\\\x\', \'\')"',
    'python3 -c "print(open(\'a.txt\').read())"',
    'python3 -c "open(\'a.txt\', \'r\').read()"',
    'python3 -c "open(\'x\')"',
    'python -m pytest -q',
    'python3 -c "open(\'/tmp/x\', \'w\').write(\'y\')"',
    'perl -e \'open(F, "<a.txt"); print <F>\'',
    'ruby -e \'puts File.read("a.txt")\'',
    'powershell -NoProfile -Command "Get-ChildItem | Select-Object Name"',
    'powershell -Command "Get-Content a.txt 2>&1"',
    'pwsh -Command "Set-Content /tmp/x.txt hi"',
    'awk \'{print $1}\' file',
    'awk \'$1 > 5 {print $2}\' file',
    'awk \'{print ($1 > 5)}\' file',
    'awk \'{print > "/dev/stderr"}\' file',
    'awk \'{print > "/tmp/out.txt"}\' file',
    'git apply --stat fix.patch',
    'patch --dry-run -p1 < /tmp/fix.patch',
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

const encodePs = (code) => Buffer.from(code, 'utf16le').toString('base64')

describe('classifyBashCommand — blocked writes through interpreters', () => {
  it.each([
    // node: inline code, stdin, nested shell
    'node -e "require(\'fs\').writeFileSync(\'src/a.ts\', \'x\')"',
    'node --eval "fs.appendFileSync(\'README.md\', \'x\')"',
    'node -pe "fs.writeFileSync(\'a\', \'b\')"',
    'node -r dotenv/config -e "fs.writeFile(\'a\', \'b\', cb)"',
    'nodejs -e "fs.copyFileSync(\'a\', \'b\')"',
    'node -e "fs.promises.rename(\'a\', \'b\')"',
    'node -e "fs.createWriteStream(\'out.txt\')"',
    "node -e 'fs.cpSync(\"a\", \"b\")'",
    heredoc("node - <<'EOF'", "require('fs').writeFileSync('src/a.ts', 'x')"),
    heredoc('node <<EOF', "fs.writeFileSync('src/a.ts', 'x')"),
    'echo "require(\'fs\').writeFileSync(\'a\', \'b\')" | node',
    'bash -c "node -e \'fs.writeFileSync(1, 2)\'"',
    'FOO=1 node -e "fs.writeFileSync(\'a\', \'b\')"',
    // python
    'python3 -c "open(\'a.py\', \'w\').write(\'x\')"',
    'python3 -c "open(\'a.py\',\'a\')"',
    'python -c "open(\'a\', mode=\'w\')"',
    'python -c "open(\'a\', \'r+\')"',
    'py -3 -c "open(\'a\', \'wb\')"',
    'python3 -c "from pathlib import Path; Path(\'a\').write_text(\'x\')"',
    'python3 -c "import shutil; shutil.copy(\'a\', \'b\')"',
    'python3 -c "import os; os.replace(\'a\', \'b\')"',
    'python3 -c "import fileinput; fileinput.input(\'a\', inplace=True)"',
    heredoc("python3 - <<'PY'", "with open('f.py', 'w') as fh:\n    fh.write('x')", 'PY'),
    // perl / ruby
    "perl -e 'open(F, \">a.txt\"); print F \"x\"'",
    "perl -e 'open(my $f, \">>\", \"a\") or die'",
    "ruby -e 'File.write(\"a\", \"b\")'",
    // awk
    "awk '{print > \"out.txt\"}' in",
    "awk '{print $1 >> \"log\"}' in",
    "awk -i inplace '{print}' f",
    "gawk -i inplace '{print}' f",
    // PowerShell
    'powershell -Command "Set-Content -Path a.txt -Value x"',
    'pwsh -c "\'x\' | Out-File a.txt"',
    'powershell -NoProfile -Command "Get-Date > a.txt"',
    'powershell -Command "[IO.File]::WriteAllText(\'a\', \'b\')"',
    'powershell.exe -Command "Add-Content a.txt hi"',
    `powershell -EncodedCommand ${encodePs('Set-Content a.txt x')}`,
    // patches
    'git apply fix.patch',
    'git apply < fix.patch',
    'git apply --index fix.patch',
    'git -C ../x apply fix.patch',
    'patch -p1 < fix.patch',
    'patch file < diff',
  ])('%s', (command) => {
    const result = classify(command)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/Edit\/Write/)
  })

  describe('scripts in a temp dir are read and scanned (repo scripts are not)', () => {
    const writes = "require('fs').writeFileSync('src/a.ts', 'x')"
    const readFiles = (files) => (file) => {
      if (!(file in files)) throw new Error(`unexpected read ${file}`)
      return files[file]
    }
    const run = (command, files) => classifyBashCommand(command, { ...options, readFile: readFiles(files) })

    it.each([
      ['node /tmp/scratch/fix.js', { '/tmp/scratch/fix.js': writes }],
      ['python3 /tmp/scratch/fix.py', { '/tmp/scratch/fix.py': "open('f.py', 'w').write('x')" }],
      ['powershell -File /tmp/scratch/fix.ps1', { '/tmp/scratch/fix.ps1': 'Set-Content a.txt x' }],
    ])('blocks %s', (command, files) => {
      expect(run(command, files).blocked).toBe(true)
    })

    it('allows a temp-dir script that does not write, or an unreadable one', () => {
      expect(run('node /tmp/scratch/look.js', { '/tmp/scratch/look.js': 'console.log(1)' })).toEqual({ blocked: false })
      expect(run('node /tmp/scratch/gone.js', {})).toEqual({ blocked: false })
      expect(classify('node /tmp/scratch/fix.js')).toEqual({ blocked: false }) // no readFile given
    })

    it('does not read repo scripts (relative or outside the temp dirs)', () => {
      expect(run('node scripts/enrich-station-coords.mjs', {})).toEqual({ blocked: false })
      expect(run('node /home/me/repo/scripts/x.mjs', {})).toEqual({ blocked: false })
    })
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
